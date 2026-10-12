import { RemoveContactMenuItem } from '../../features/contacts/RemoveContactMenuItem';
import { useState } from 'react';
import { BellOff, Bell, Archive, ArchiveRestore, Trash2, ShieldOff, Flag } from 'lucide-react';
import { blockUser, reportUser, toggleMuteChat, toggleArchiveChat, deleteChatForMe } from '../../features/chat/chatService';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from '../../context/ToastContext';

interface Props {
  chatId: string;
  currentUid: string;
  otherUid: string;
  otherName: string;
  isMuted: boolean;
  isArchived: boolean;
  onClose: () => void;
  onChatDeleted: () => void;
  onBlocked: () => void;
}

const REPORT_REASONS = ['Spam', 'Harassment', 'Inappropriate content', 'Impersonation', 'Other'];

export function ChatOptionsMenu({ chatId, currentUid, otherUid, otherName, isMuted, isArchived, onClose, onChatDeleted, onBlocked }: Props) {
  const { showToast } = useToast();
  const [showReport, setShowReport] = useState(false);
  const [confirming, setConfirming] = useState<'delete' | 'block' | null>(null);

  async function handleReport(reason: string) {
    await reportUser(currentUid, otherUid, reason, `chat:${chatId}`);
    showToast('Report submitted. Thanks for letting us know.', 'success');
    onClose();
  }

  async function handleDelete() {
    await deleteChatForMe(chatId, currentUid);
    onChatDeleted();
  }
  async function handleBlock() {
    await blockUser(currentUid, otherUid);
    showToast('User blocked.', 'info');
    onBlocked();
  }

  if (confirming === 'delete') {
    return (
      <ConfirmDialog
        title="Delete this chat?"
        message="This removes the chat from your list. The other person will still see their copy of it."
        confirmLabel="Delete chat"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirming(null)}
      />
    );
  }

  if (confirming === 'block') {
    return (
      <ConfirmDialog
        title="Block this user?"
        message="They won't be able to call you, and you won't see new messages from them until you unblock them in Settings."
        confirmLabel="Block user"
        danger
        onConfirm={handleBlock}
        onCancel={() => setConfirming(null)}
      />
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 300, padding: 16 }} onClick={(e) => e.stopPropagation()}>
        {!showReport ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button style={rowStyle} onClick={() => toggleMuteChat(chatId, currentUid, !isMuted).then(onClose)}>
              {isMuted ? <Bell size={15} strokeWidth={1.75} /> : <BellOff size={15} strokeWidth={1.75} />} {isMuted ? 'Unmute chat' : 'Mute chat'}
            </button>
            <button style={rowStyle} onClick={() => toggleArchiveChat(chatId, currentUid, !isArchived).then(onClose)}>
              {isArchived ? <ArchiveRestore size={15} strokeWidth={1.75} /> : <Archive size={15} strokeWidth={1.75} />} {isArchived ? 'Unarchive chat' : 'Archive chat'}
            </button>
            <button style={rowStyle} onClick={() => setConfirming('delete')}>
              <Trash2 size={15} strokeWidth={1.75} /> Delete chat
            </button>
            <RemoveContactMenuItem
              currentUid={currentUid}
              otherUid={otherUid}
              otherName={otherName}
              style={rowStyle}
              onRemoved={onClose}
            />
            <button style={{ ...rowStyle, color: 'var(--color-danger)' }} onClick={() => setConfirming('block')}>
              <ShieldOff size={15} strokeWidth={1.75} /> Block user
            </button>
            <button style={{ ...rowStyle, color: 'var(--color-danger)' }} onClick={() => setShowReport(true)}>
              <Flag size={15} strokeWidth={1.75} /> Report user
            </button>
          </div>
        ) : (
          <div>
            <h4 style={{ marginBottom: 10 }}>Why are you reporting this user?</h4>
            {REPORT_REASONS.map((reason) => (
              <button key={reason} style={rowStyle} onClick={() => handleReport(reason)}>
                {reason}
              </button>
            ))}
          </div>
        )}
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
  alignItems: 'center',
  gap: 9,
  width: '100%',
  padding: '9px 8px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 14,
  borderRadius: 8,
  color: 'inherit',
};
