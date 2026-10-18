import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserChats } from './chatService';
import type { Chat } from './chatTypes';
import { ChatPreviewText } from './ChatPreviewText';
import { neutralizePreview } from './previewText';
import { NewChatModal } from '../../components/common/NewChatModal';
import { Plus, Archive, BellOff, Bell, MoreVertical, Search, Settings, LogOut, Check, X } from 'lucide-react';
import { appConfig } from '../../config/appConfig';
import { BrandMark } from '../../components/common/BrandMark';
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

export function ChatList() {
  const navigate = useNavigate();
  const { profile, logOut } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showRequestPanel, setShowRequestPanel] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [removedContactUids, setRemovedContactUids] = useState<Set<string>>(new Set());
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [acceptedContactUids, setAcceptedContactUids] = useState<Set<string>>(new Set());
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState('');
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestLoadError, setRequestLoadError] = useState('');
  const [requestReload, setRequestReload] = useState(0);
  const requestPanelRef = useRef<HTMLDivElement>(null);
  const requestBellRef = useRef<HTMLButtonElement>(null);
  const myUid = profile?.uid;

  const incomingRequests = contactRequests.filter(
    (request) => request.recipientUid === myUid && request.status === 'pending'
  );

  const outgoingRequests = contactRequests.filter(
    (request) => request.requesterUid === myUid && request.status === 'pending'
  );
  const pendingRequestCount = incomingRequests.length;

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
      setRequestsLoading(false);
      return;
    }

    setRequestsLoading(true);
    return subscribeToMyContactRequests(
      myUid,
      (requests) => {
        setContactRequests(requests);
        setRequestError('');
        setRequestLoadError('');
        setRequestsLoading(false);
      },
      (error) => {
        console.error('Could not load contact requests:', error);
        setRequestLoadError('Contact requests could not be loaded.');
        setRequestsLoading(false);
      }
    );
  }, [myUid, requestReload]);

  useEffect(() => {
    if (!showRequestPanel) return;

    function dismissOutside(event: PointerEvent) {
      if (!requestPanelRef.current?.contains(event.target as Node)
        && !requestBellRef.current?.contains(event.target as Node)) {
        setShowRequestPanel(false);
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowRequestPanel(false);
        requestBellRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [showRequestPanel]);

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
    const otherInfo = c.participantInfo[otherUid];
    const searchValue = `${otherInfo?.displayName ?? ''} ${c.lastMessage ?? ''}`.toLowerCase();

    return inSelectedArchive &&
      (!removedContactUids.has(otherUid) || isAcceptedContact) &&
      searchValue.includes(chatSearch.trim().toLowerCase());
  });

  return (
    <div className="rb-list-page rb-chats-page">
      <header className="rb-chats-app-header">
        <Link to="/" className="rb-chats-brand" aria-label={`${appConfig.name} home`}>
          <BrandMark size={25} />
          <span>GI MEET</span>
        </Link>
        <details className="rb-chats-app-menu">
          <summary className="rb-btn rb-btn--outline rb-icon-btn" aria-label="Open app menu" title="Menu">
            <MoreVertical size={19} aria-hidden="true" />
          </summary>
          <div className="rb-chats-app-menu__panel rb-menu-surface" role="group" aria-label="App menu">
            <Link to="/settings" className="rb-chats-app-menu__item">
              <Settings size={16} aria-hidden="true" />
              <span>Settings</span>
            </Link>
            <button type="button" className="rb-chats-app-menu__item" onClick={() => void logOut()}>
              <LogOut size={16} aria-hidden="true" />
              <span>Log out</span>
            </button>
          </div>
        </details>
      </header>

      <div className="rb-chats-search-row">
        <label className="rb-chats-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search chats"
            placeholder="Search chats"
            value={chatSearch}
            onChange={(event) => setChatSearch(event.target.value)}
          />
        </label>
        <button
          className="rb-chats-people-search"
          type="button"
          onClick={() => navigate('/search')}
          aria-label="Search people"
          title="Search people"
        >
          <Search size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="rb-chats-controls">
        <h1>Chats</h1>
        <div className="rb-chats-controls__actions">
          <button className="rb-btn rb-btn--outline" style={{ fontSize: 13, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowArchived((v) => !v)}>
            <Archive size={15} strokeWidth={1.75} /> {showArchived ? 'Back to chats' : 'Archived'}
          </button>
          <button className="rb-btn rb-btn--primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowNewChat(true)}>
            <Plus size={16} strokeWidth={2} /> New Chat
          </button>
          <div className="rb-request-notifications">
            <button
              ref={requestBellRef}
              className="rb-btn rb-btn--outline rb-icon-btn rb-request-bell"
              type="button"
              aria-label={pendingRequestCount > 0 ? `Contact requests, ${pendingRequestCount} pending` : 'Contact requests'}
              aria-expanded={showRequestPanel}
              aria-controls="contact-request-panel"
              title="Contact requests"
              onClick={() => setShowRequestPanel((open) => !open)}
            >
              <Bell size={18} aria-hidden="true" />
              {pendingRequestCount > 0 && (
                <span className="rb-request-badge" aria-label={`${pendingRequestCount} pending`}>
                  {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                </span>
              )}
            </button>
            {showRequestPanel && (
              <section
                ref={requestPanelRef}
                id="contact-request-panel"
                className="rb-request-panel rb-menu-surface"
                aria-label="Contact requests"
              >
                <div className="rb-request-panel__header">
                  <h2>Contact requests</h2>
                  <span>{pendingRequestCount} pending</span>
                </div>
                {requestError && <p className="rb-request-panel__error" role="alert">{requestError}</p>}
                {requestsLoading ? (
                  <p className="rb-request-panel__state" role="status">Loading requests…</p>
                ) : requestLoadError ? (
                  <div className="rb-request-panel__failure">
                    <p className="rb-request-panel__error" role="alert">{requestLoadError}</p>
                    <button className="rb-btn rb-btn--outline" onClick={() => {
                      setRequestLoadError('');
                      setRequestsLoading(true);
                      setRequestReload((version) => version + 1);
                    }}>
                      Retry
                    </button>
                  </div>
                ) : incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
                  <p className="rb-request-panel__state">No contact requests.</p>
                ) : (
                  <div className="rb-request-panel__list">
                    {incomingRequests.map((request) => {
                      const person = request.requesterInfo;
                      const busy = requestActionId === request.id;

                      return (
                        <div className="rb-request-item" key={request.id}>
                          <div className="rb-request-item__identity">
                            <span className="rb-request-avatar" aria-hidden="true">
                              {(person?.displayName || 'GI Meet user').charAt(0).toUpperCase()}
                            </span>
                            <div className="rb-request-item__name">
                              <strong>{person?.displayName || 'GI Meet user'}</strong>
                              {person?.username && <span>@{person.username}</span>}
                            </div>
                          </div>
                          <div className="rb-request-item__actions">
                            <button
                              className="rb-btn rb-btn--primary"
                              disabled={requestActionId !== null}
                              aria-label={`Accept request from ${person?.displayName || 'GI Meet user'}`}
                              onClick={() => void handleRequestAction(request, 'accept')}
                            >
                              <Check size={15} aria-hidden="true" /> {busy ? 'Working…' : 'Accept'}
                            </button>
                            <button
                              className="rb-btn rb-btn--outline"
                              disabled={requestActionId !== null}
                              aria-label={`Reject request from ${person?.displayName || 'GI Meet user'}`}
                              onClick={() => void handleRequestAction(request, 'reject')}
                            >
                              <X size={15} aria-hidden="true" /> Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {outgoingRequests.map((request) => (
                      <div className="rb-request-item rb-request-item--outgoing" key={request.id}>
                        <div className="rb-request-item__identity">
                          <span className="rb-request-avatar" aria-hidden="true">
                            {(request.recipientInfo?.displayName || 'GI Meet user').charAt(0).toUpperCase()}
                          </span>
                          <div className="rb-request-item__name">
                            <strong>{request.recipientInfo?.displayName || 'GI Meet user'}</strong>
                            <span>Request sent · Awaiting response</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {visibleChats.length === 0 && (
        <div className="rb-empty-state">
          <h2>{chatSearch.trim() ? 'No matching chats' : showArchived ? 'No archived chats' : 'No chats yet'}</h2>
          <p>{chatSearch.trim() ? 'Try another name or message.' : showArchived ? 'Archived chats will appear here.' : 'Start a conversation with the New chat button.'}</p>
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
            className="rb-chat-list-item"
            aria-label={`Open chat with ${otherInfo?.displayName ?? 'Unknown user'}${unread > 0 ? `, ${unread} unread messages` : ''}`}
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
                aria-hidden="true"
                style={{
                  background: 'var(--color-brand-600)',
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
