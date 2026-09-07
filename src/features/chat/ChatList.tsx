import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserChats, getOrCreateDirectChat } from './chatService';
import type { Chat } from './chatTypes';
import { NewChatModal } from '../../components/common/NewChatModal';
import type { UserProfile } from '../../utils/types';
import { Plus, Archive, BellOff } from 'lucide-react';
import { soundService } from '../../services/soundService';

export function ChatList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!profile) return;
    const unsubscribe = subscribeToUserChats(profile.uid, setChats);
    return unsubscribe;
  }, [profile]);

  // Lightweight unread count: listen to each chat's recent messages and count
  // ones newer than this user's lastReadAt. Fine at MVP chat-list scale.
  // Also chimes for genuinely new incoming messages (skips the initial
  // snapshot so it doesn't ding for pre-existing unread messages on load).
  const seenInitialSnapshot = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    const unsubscribers = chats.map((chat) => {
      const lastRead = chat.lastReadAt[profile.uid] ?? 0;
      const isMuted = chat.mutedBy.includes(profile.uid);
      const q = query(collection(db, 'chats', chat.id, 'messages'), where('senderId', '!=', profile.uid));
      return onSnapshot(q, (snap) => {
        const count = snap.docs.filter((d) => (d.data().createdAt?.toMillis?.() ?? 0) > lastRead).length;
        setUnreadCounts((prev) => ({ ...prev, [chat.id]: count }));

        if (seenInitialSnapshot.current.has(chat.id)) {
          const hasNewMessage = snap.docChanges().some((change) => change.type === 'added');
          if (hasNewMessage && !isMuted) soundService.playMessageChime();
        } else {
          seenInitialSnapshot.current.add(chat.id);
        }
      });
    });
    return () => unsubscribers.forEach((u) => u());
  }, [chats, profile]);

  async function handleSelectUser(user: UserProfile) {
    if (!profile) return;
    const chatId = await getOrCreateDirectChat(
      profile.uid,
      { displayName: profile.displayName, photoURL: profile.photoURL },
      user.uid,
      { displayName: user.displayName, photoURL: user.photoURL }
    );
    setShowNewChat(false);
    navigate(`/chat/${chatId}`);
  }

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
          currentUid={profile.uid}
          onClose={() => setShowNewChat(false)}
          onSelectUser={handleSelectUser}
        />
      )}
    </div>
  );
}
