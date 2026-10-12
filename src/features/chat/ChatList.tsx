import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserChats } from './chatService';
import type { Chat } from './chatTypes';
import { NewChatModal } from '../../components/common/NewChatModal';
import { Plus, Archive, BellOff } from 'lucide-react';
import { soundService } from '../../services/soundService';
import { createIncomingMessageDetector } from '../../utils/incomingMessageDetector';

export function ChatList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const myUid = profile?.uid;

  useEffect(() => {
    if (!myUid) return;
    return subscribeToUserChats(myUid, setChats);
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

  const visibleChats = chats.filter((c) =>
    showArchived ? c.archivedBy.includes(profile.uid) : !c.archivedBy.includes(profile.uid)
  );

  return (
    <div style={{ padding: '20px 0' }}>
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
                color: 'var(--color-brand-700)',
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
                {isTyping ? 'typing…' : chat.lastMessage || 'Say hello 👋'}
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
