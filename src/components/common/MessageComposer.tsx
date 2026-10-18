import { useRef, useState, type KeyboardEvent } from 'react';
import { Smile, Paperclip, SendHorizontal, X, Camera as CameraIcon } from 'lucide-react';
import type { Message } from '../../features/chat/chatTypes';
import { validateFile } from '../../services/storageService';
import { EmojiPicker } from './EmojiPicker';
import { VoiceRecorderButton } from './VoiceRecorderButton';
import { isNativePlatform } from '../../utils/platform';

interface Props {
  replyingTo: Message | null;
  onCancelReply: () => void;
  onSend: (text: string) => void | Promise<void>;
  onSendFile?: (file: File) => void;
  onSendVoice?: (blob: Blob, durationSeconds: number) => void;
  onTypingChange?: (isTyping: boolean) => void;
  placeholder?: string;
}

export function MessageComposer({
  replyingTo,
  onCancelReply,
  onSend,
  onSendFile,
  onSendVoice,
  onTypingChange,
  placeholder = 'Type a message...',
}: Props) {
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();
  const sendingRef = useRef(false);

  function handleChange(value: string) {
    setText(value);
    setSendError(null);
    onTypingChange?.(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTypingChange?.(false), 2000);
  }

  async function handleSubmit() {
    if (!text.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      await onSend(text);
      setText('');
      onTypingChange?.(false);
    } catch (error) {
      setSendError(error instanceof Error ? `Message not sent: ${error.message}` : 'Message not sent. Please try again.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onSendFile) return;

    const check = validateFile(file);
    if (!check.valid) {
      setFileError(check.message ?? 'Invalid file.');
      return;
    }
    setFileError(null);
    onSendFile(file);
  }

  async function handleCameraCapture() {
    if (!onSendFile) return;
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
      });
      if (!photo.webPath) return;

      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const file = new File([blob], `photo-${Date.now()}.jpeg`, { type: blob.type || 'image/jpeg' });

      const check = validateFile(file);
      if (!check.valid) {
        setFileError(check.message ?? 'Invalid file.');
        return;
      }
      setFileError(null);
      onSendFile(file);
    } catch {
      // User cancelled the picker, or camera/photos permission was denied — no-op.
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px 16px', background: 'var(--color-surface)' }}>
      {replyingTo && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-surface-alt)',
            borderRadius: 8,
            padding: '6px 10px',
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Replying to: {replyingTo.text}
          </span>
          <button onClick={onCancelReply} style={iconBtnStyle} aria-label="Cancel reply"><X size={16} strokeWidth={1.75} /></button>
        </div>
      )}

      {(fileError || sendError) && (
        <p className="rb-error-text" role="alert" style={{ margin: '0 0 8px' }}>
          {sendError ?? fileError}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setShowEmoji((v) => !v)} style={iconBtnStyle} aria-label="Add emoji">
            <Smile size={19} strokeWidth={1.75} />
          </button>
          {showEmoji && (
            <EmojiPicker onSelect={(emoji) => handleChange(text + emoji)} onClose={() => setShowEmoji(false)} />
          )}
        </div>

        {onSendFile && isNativePlatform() && (
          <button type="button" onClick={handleCameraCapture} style={iconBtnStyle} aria-label="Camera">
            <CameraIcon size={19} strokeWidth={1.75} />
          </button>
        )}

        {onSendFile && (
          <>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={iconBtnStyle} aria-label="Attach file">
              <Paperclip size={18} strokeWidth={1.75} />
            </button>
            <input ref={fileInputRef} type="file" hidden onChange={handleFilePicked} />
          </>
        )}

        <input
          className="rb-input"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={sending}
        />

        {text.trim() ? (
          <button
            className="rb-btn rb-btn--primary"
            onClick={handleSubmit}
            disabled={sending}
            style={{ width: 40, height: 40, padding: 0, borderRadius: '50%', flexShrink: 0 }}
            aria-label={sending ? 'Sending message' : 'Send'}
          >
            <SendHorizontal size={17} strokeWidth={2} />
          </button>
        ) : (
          onSendVoice && <VoiceRecorderButton onRecorded={onSendVoice} />
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 8,
  borderRadius: 8,
};