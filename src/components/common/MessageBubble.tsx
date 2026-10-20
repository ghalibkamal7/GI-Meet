import { useState } from 'react';
import { Smile, Reply, Forward, Copy, Star, Pin, Pencil, Trash2, Paperclip, MoreHorizontal } from 'lucide-react';
import type { Message } from '../../features/chat/chatTypes';
import { EmojiPicker } from './EmojiPicker';
import { useToast } from '../../context/ToastContext';

interface Props {
  message: Message;
  isOwn: boolean;
  currentUid: string;
  onReply: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onEdit?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onToggleReaction?: (message: Message, emoji: string) => void;
  onToggleStar?: (message: Message) => void;
  onTogglePin?: (message: Message) => void;
  isPinned?: boolean;
}

export function MessageBubble({
  message,
  isOwn,
  currentUid,
  onReply,
  onDelete,
  onEdit,
  onForward,
  onToggleReaction,
  onToggleStar,
  onTogglePin,
  isPinned,
}: Props) {
  const { showToast } = useToast();
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isStarred = message.starredBy.includes(currentUid);

  async function handleCopy() {
    if (!message.text) return;
    try {
      await navigator.clipboard.writeText(message.text);
      showToast('Message copied.', 'success');
    } catch {
      showToast('Clipboard access failed. Check browser permissions and try again.', 'error');
    }
  }

  const reactionEntries = Object.entries(message.reactions).filter(([, uids]) => uids.length > 0);

  return (
    <div
      style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: 10 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) {
          setShowActions(false);
          setShowEmojiPicker(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setShowActions(false);
          setShowEmojiPicker(false);
        }
      }}
    >
      <div style={{ maxWidth: '70%', position: 'relative' }}>
        {!message.deleted && (
          <button
            type="button"
            onClick={() => setShowActions((visible) => !visible)}
            onFocus={() => setShowActions(true)}
            style={{ ...actionBtnStyle, position: 'absolute', top: -42, right: isOwn ? 0 : 'auto', left: isOwn ? 'auto' : 0, zIndex: 1 }}
            aria-label="Message actions"
            aria-expanded={showActions}
            aria-controls={`message-actions-${message.id}`}
          >
            <MoreHorizontal size={17} strokeWidth={1.75} />
          </button>
        )}
        {showActions && !message.deleted && (
          <div
            id={`message-actions-${message.id}`}
            data-message-actions
            role="group"
            aria-label="Message actions"
            style={{
              position: 'absolute',
              top: -32,
              right: isOwn ? 0 : 'auto',
              left: isOwn ? 'auto' : 0,
              display: 'flex',
              flexWrap: 'wrap',
              width: 'min(320px, calc(100vw - 32px))',
              boxSizing: 'border-box',
              zIndex: 2,
              gap: 2,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: 3,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {onToggleReaction && (
              <span style={{ position: 'relative' }}>
                <button type="button" onClick={() => setShowEmojiPicker((v) => !v)} style={actionBtnStyle} aria-label="React">
                  <Smile size={14} strokeWidth={1.75} />
                </button>
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={(emoji) => {
                      onToggleReaction(message, emoji);
                      setShowEmojiPicker(false);
                      setShowActions(false);
                    }}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}
              </span>
            )}
            <button type="button" onClick={() => { onReply(message); setShowActions(false); }} style={actionBtnStyle} aria-label="Reply">
              <Reply size={14} strokeWidth={1.75} />
            </button>
            {onForward && (
              <button type="button" onClick={() => { onForward(message); setShowActions(false); }} style={actionBtnStyle} aria-label="Forward">
                <Forward size={14} strokeWidth={1.75} />
              </button>
            )}
            <button type="button" onClick={handleCopy} style={actionBtnStyle} aria-label="Copy">
              <Copy size={14} strokeWidth={1.75} />
            </button>
            {onToggleStar && (
              <button type="button" onClick={() => { onToggleStar(message); setShowActions(false); }} style={actionBtnStyle} aria-label={isStarred ? 'Unstar message' : 'Star message'}>
                <Star size={14} strokeWidth={1.75} fill={isStarred ? 'var(--color-accent)' : 'none'} color={isStarred ? 'var(--color-accent)' : 'currentColor'} />
              </button>
            )}
            {onTogglePin && (
              <button type="button" onClick={() => { onTogglePin(message); setShowActions(false); }} style={actionBtnStyle} aria-label={isPinned ? 'Unpin message' : 'Pin message'}>
                <Pin size={14} strokeWidth={1.75} fill={isPinned ? 'var(--color-brand-600)' : 'none'} color={isPinned ? 'var(--color-brand-600)' : 'currentColor'} />
              </button>
            )}
            {isOwn && onEdit && !message.attachment && (
              <button type="button" onClick={() => { onEdit(message); setShowActions(false); }} style={actionBtnStyle} aria-label="Edit message">
                <Pencil size={14} strokeWidth={1.75} />
              </button>
            )}
            {isOwn && (
              <button type="button" onClick={() => { onDelete(message.id); setShowActions(false); }} style={actionBtnStyle} aria-label="Delete message">
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}

        <div
          className="rb-card"
          style={{
            padding: '9px 13px',
            background: isOwn ? 'var(--color-brand-700)' : 'var(--color-surface)',
            color: isOwn ? '#fff' : 'var(--color-text)',
            borderRadius: 16,
            borderBottomRightRadius: isOwn ? 4 : 16,
            borderBottomLeftRadius: isOwn ? 16 : 4,
            boxShadow: 'none',
            border: isOwn ? 'none' : '1px solid var(--color-border)',
          }}
        >
          {message.forwardedFrom && (
            <div style={{ fontSize: 11, opacity: 0.7, fontStyle: 'italic', marginBottom: 4 }}>
              Forwarded from {message.forwardedFrom.senderName}
            </div>
          )}

          {message.replyTo && (
            <div
              style={{
                borderLeft: '3px solid var(--color-accent)',
                paddingLeft: 8,
                marginBottom: 6,
                fontSize: 13,
                opacity: 0.8,
              }}
            >
              {message.replyTo.text}
            </div>
          )}

          {message.deleted ? (
            <em style={{ opacity: 0.6, fontSize: 14 }}>This message was deleted</em>
          ) : (
            <>
              {message.attachment?.type === 'image' && (
                <img
                  src={message.attachment.url}
                  alt={message.attachment.name}
                  style={{ maxWidth: '100%', borderRadius: 10, marginBottom: message.text ? 6 : 0 }}
                />
              )}
              {message.attachment?.type === 'video' && (
                <video
                  src={message.attachment.url}
                  controls
                  style={{ maxWidth: '100%', borderRadius: 10, marginBottom: message.text ? 6 : 0 }}
                />
              )}
              {message.attachment?.type === 'audio' && (
                <audio src={message.attachment.url} controls style={{ marginBottom: message.text ? 6 : 0 }} />
              )}
              {message.attachment?.type === 'file' && (
                <a
                  href={message.attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    textDecoration: 'underline',
                    marginBottom: message.text ? 6 : 0,
                  }}
                >
                  <Paperclip size={13} strokeWidth={1.75} /> {message.attachment.name}
                </a>
              )}
              {message.text && <span style={{ fontSize: 14.5, lineHeight: 1.45 }}>{message.text}</span>}
            </>
          )}

          <div style={{ fontSize: 10.5, opacity: 0.65, marginTop: 4, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 5, alignItems: 'center' }}>
            {message.editedAt && <span>edited</span>}
            {isStarred && <Star size={10} fill="currentColor" strokeWidth={0} />}
            <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {reactionEntries.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {reactionEntries.map(([emoji, uids]) => (
              <button
                type="button"
                key={emoji}
                onClick={() => onToggleReaction?.(message, emoji)}
                aria-label={`React with ${emoji}, ${uids.length} reactions`}
                style={{
                  fontSize: 12,
                  background: uids.includes(currentUid) ? 'var(--color-brand-100)' : 'var(--color-surface-alt)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 999,
                  padding: '1px 7px',
                  cursor: 'pointer',
                }}
              >
                {emoji} {uids.length}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderRadius: 6,
  padding: 8,
  minWidth: 36,
  minHeight: 36,
  cursor: 'pointer',
  color: 'var(--color-text-muted)',
  display: 'flex',
  alignItems: 'center',
};
