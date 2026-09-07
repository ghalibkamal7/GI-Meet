import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserChats, forwardMessage } from '../../features/chat/chatService';
import { subscribeToUserGroups, sendGroupMessage } from '../../features/groups/groupService';
import type { Chat } from '../../features/chat/chatTypes';
import type { Group } from '../../features/groups/groupTypes';
import type { Message } from '../../features/chat/chatTypes';

export function ForwardMessageModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const { profile } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const u1 = subscribeToUserChats(profile.uid, setChats);
    const u2 = subscribeToUserGroups(profile.uid, setGroups);
    return () => {
      u1();
      u2();
    };
  }, [profile]);

  async function handleForwardToChat(chat: Chat) {
    if (!profile) return;
    await forwardMessage(chat.id, profile.uid, message, profile.displayName);
    setSentTo(chat.id);
  }

  async function handleForwardToGroup(group: Group) {
    if (!profile) return;
    await sendGroupMessage({
      groupId: group.id,
      senderId: profile.uid,
      text: message.text,
      attachment: message.attachment ?? undefined,
    });
    setSentTo(group.id);
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 360, padding: 20, maxHeight: '70vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Forward message</h3>

        {groups.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', margin: '10px 0 4px' }}>Groups</div>}
        {groups.map((g) => (
          <button key={g.id} onClick={() => handleForwardToGroup(g)} style={rowStyle}>
            {g.name}
            {sentTo === g.id && <span style={{ color: 'var(--color-brand-600)' }}>Sent ✓</span>}
          </button>
        ))}

        {chats.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', margin: '10px 0 4px' }}>Chats</div>}
        {chats.map((c) => {
          const otherUid = c.participants.find((p) => p !== profile?.uid) ?? '';
          const otherInfo = c.participantInfo[otherUid];
          return (
            <button key={c.id} onClick={() => handleForwardToChat(c)} style={rowStyle}>
              {otherInfo?.displayName ?? 'Unknown'}
              {sentTo === c.id && <span style={{ color: 'var(--color-brand-600)' }}>Sent ✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 51, 47, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 150,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  padding: '8px 6px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 14,
};
