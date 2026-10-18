import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserChats } from './chatService';
import type { Chat } from './chatTypes';
import { ChatPreviewText } from './ChatPreviewText';
import { neutralizePreview } from './previewText';
import { NewChatModal } from '../../components/common/NewChatModal';
import { Plus, Archive, BellOff } from 'lucide-react';
import { soundService } from '../../services/soundService';
import { createIncomingMessageDetector } from '../../utils/incomingMessageDetector';
import {
  subscribeToRemovedContacts,
  subscribeToMyAcceptedContacts,
} from '../contacts/contactService';
import {
  subscribeToMyContactRequests,
  acceptContactRequest,
  rejectContactRequest,
  type ContactRequest,
} from '../contacts/contactRequestService';
import { Check, X } from 'lucide-react';

export function ChatList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [removedContactUids, setRemovedContactUids] = useState<Set<string>>(new Set());
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [acceptedContactUids, setAcceptedContactUids] = useState<Set<string>>(new Set());
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState('');
  const myUid = profile?.uid;

  const incomingRequests = contactRequests.filter(
    (request) => request.recipientUid === myUid && request.status === 'pending'
  );

  const outgoingRequests = contactRequests.filter(
    (request) => request.requesterUid === myUid && request.status === 'pending'
  );

  async function handleRequestAction(
    request: ContactRequest,
    action: 'accept' | 'reject'
  ) {
    if (!myUid) return;

    setRequestActionId(request.id);
    setRequestError('');

    try {
      if (action === 'accept') {
        await acceptContactRequest(myUid, request);
      } else {
        await rejectContactRequest(myUid, request);
      }
    } catch (error) {
      console.error(`Could not ${action} contact request:`, error);
      setRequestError(
        error instanceof Error ? error.message : 'Request action failed. Please try again.'
      );
    } finally {
      setRequestActionId(null);
    }
  }

  useEffect(() => {
    if (!myUid) return;
    return subscribeToUserChats(myUid, setChats);
  }, [myUid]);

  // Keep contacts removed by me out of both chat-list views.
  // This only filters the UI; it does not delete chats or messages.
  useEffect(() => {
    if (!myUid) {
      setRemovedContactUids(new Set());
      return;
    }
    return subscribeToRemovedContacts(
      myUid,
      setRemovedContactUids,
      (error) => console.error('Could not load removed contacts:', error)
    );
  }, [myUid]);
useEffect(() => {
  if (!myUid) {
    setContactRequests([]);
    return;
  }

  return subscribeToMyContactRequests(
    myUid,
    setContactRequests,
    (error) => {
      console.error('Could not load contact requests:', error);
      setRequestError('Contact requests could not be loaded.');
    }
  );
}, [myUid]);

  useEffect(() => {
    if (!myUid) {
      setAcceptedContactUids(new Set());
      return;
    }

    return subscribeToMyAcceptedContacts(
      myUid,
      (contacts) => {
        const uids = new Set<string>();
        for (const contact of contacts) {
          for (const memberUid of contact.members) {
            if (memberUid !== myUid) uids.add(memberUid);
          }
        }
        setAcceptedContactUids(uids);
      },
      (error) => console.error('Could not load accepted contacts:', error)
    );
  }, [myUid]);

  // --- Unread counts --------------------------------------------------------------
  // Re-subscribe ONLY when the set of chats or someone's read marker really changes - not on every chat
  // document update (typing indicators, last-message changes...). Each listener reads only the messages
  // NEWER than my read marker, so it stays small. lastReadAt is epoch ms (docToChat converts it).
  const chatsRef = useRef<Chat[]>([]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  const unreadKey = myUid ? chats.map((c) => `${c.id}:${c.lastReadAt[myUid] ?? 0}`).join('|') : '';

  useEffect(() => {
    if (!myUid) return;
    const unsubscribers = chatsRef.current.map((chat) => {
      const lastRead = chat.lastReadAt[myUid] ?? 0;
      const q = query(collection(db, 'chats', chat.id, 'messages'), where('createdAt', '>', Timestamp.fromMillis(lastRead)));
      return onSnapshot(q, (snap) => {
        const count = snap.docs.filter((d) => d.data().senderId !== myUid).length;
        setUnreadCounts((prev) => (prev[chat.id] === count ? prev : { ...prev, [chat.id]: count }));
      });
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [myUid, unreadKey]);

  // --- Incoming-message chime -----------------------------------------------------
  // Driven by the chat documents (lastMessageAt / lastMessageSenderId), not by per-chat message listeners:
  // the first snapshot, my own messages, muted chats, typing/presence updates and re-subscriptions are all silent.
  const detectIncomingRef = useRef<ReturnType<typeof createIncomingMessageDetector> | null>(null);
  useEffect(() => {
    detectIncomingRef.current = myUid ? createIncomingMessageDetector(myUid) : null;
  }, [myUid]);

  useEffect(() => {
    if (!myUid || !detectIncomingRef.current) return;
    const audibleChats = chats.filter((c) => !c.mutedBy.includes(myUid));
    if (detectIncomingRef.current(audibleChats)) soundService.playMessageChime();
  }, [chats, myUid]);


  if (!profile) return null;

  const visibleChats = chats.filter((c) => {
    const otherUid = c.participants.find((participantUid) => participantUid !== profile.uid) ?? '';
    const inSelectedArchive = showArchived
      ? c.archivedBy.includes(profile.uid)
      : !c.archivedBy.includes(profile.uid);
    const isAcceptedContact = acceptedContactUids.has(otherUid);

    return inSelectedArchive &&
      (!removedContactUids.has(otherUid) || isAcceptedContact);
  });

  return (
    <div className="rb-list-page" style={{ padding: '20px 0' }}>

  {(incomingRequests.length > 0 || outgoingRequests.length > 0 || requestError) && (
    <section style={{ padding: '0 20px 16px' }}>
      <h2 style={{ fontSize: 17, marginBottom: 10 }}>Contact requests</h2>

      {requestError && (
        <p role="alert" style={{ color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
          {requestError}
        </p>
      )}

      {incomingRequests.map((request) => {
        const person = request.requesterInfo;

        return (
          <div
            key={request.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 0',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {person?.displayName || 'GI Meet user'}
              </div>
              {person?.username && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  @{person.username}
                </div>
              )}
            </div>

            <button
              className="rb-btn rb-btn--primary"
              disabled={requestActionId !== null}
              onClick={() => void handleRequestAction(request, 'accept')}
            >
              <Check size={14} /> Accept
            </button>

            <button
              className="rb-btn rb-btn--outline"
              disabled={requestActionId !== null}
              onClick={() => void handleRequestAction(request, 'reject')}
            >
              <X size={14} /> Reject
            </button>
          </div>
        );
      })}

      {outgoingRequests.map((request) => (
        <div key={request.id} style={{ padding: '8px 0', fontSize: 13 }}>
          Request sent to {request.recipientInfo?.displayName || 'GI Meet user'} — awaiting response
        </div>
      ))}
    </section>
  )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px 16px' }}>
        <h1 style={{ fontSize: 22 }}>Chats</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="rb-btn rb-btn--outline" style={{ fontSize: 13, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowArchived((v) => !v)}>
            <Archive size={15} strokeWidth={1.75} /> {showArchived ? 'Back to chats' : 'Archived'}
          </button>
          <button className="rb-btn rb-btn--primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowNewChat(true)}>
            <Plus size={16} strokeWidth={2} /> New chat
          </button>
        </div>
      </div>

      {visibleChats.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {showArchived ? 'No archived chats.' : 'No chats yet. Start one with the button above.'}
        </div>
      )}

      {visibleChats.map((chat) => {
        const otherUid = chat.participants.find((p) => p !== profile.uid) ?? '';
        const otherInfo = chat.participantInfo[otherUid];
        const isTyping = chat.typing[otherUid];
        const unread = unreadCounts[chat.id] ?? 0;
        const isMuted = chat.mutedBy.includes(profile.uid);

        return (
          <button
            key={chat.id}
            onClick={() => navigate(`/chat/${chat.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--color-border)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--color-brand-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                color: 'var(--color-brand-600)',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {otherInfo?.photoURL ? (
                <img src={otherInfo.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                (otherInfo?.displayName ?? '?').charAt(0).toUpperCase()
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                {otherInfo?.displayName ?? 'Unknown user'}
                {isMuted && <BellOff size={12} strokeWidth={1.75} color="var(--color-text-muted)" />}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: isTyping ? 'var(--color-brand-600)' : 'var(--color-text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {isTyping ? 'typing…' : chat.lastMessageCipher ? <ChatPreviewText chat={chat} /> : neutralizePreview(chat.lastMessage) || 'Say hello'}
              </div>
            </div>
            {unread > 0 && !isMuted && (
              <span
                style={{
                  background: 'var(--color-brand-700)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 999,
                  minWidth: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                }}
              >
                {unread}
              </span>
            )}
          </button>
        );
      })}

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  );
}
