import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { subscribeToMeetingChat, sendMeetingChatMessage, type MeetingChatMessage } from './meetingChatService';
import { useAuth } from '../../context/AuthContext';
import { GiAiSummaryButton } from '../gi-ai/GiAiSummaryButton';
import { summarizeMeeting } from '../gi-ai/giAiService';

export function MeetingChatPanel({ meetingCode, onClose }: { meetingCode: string; onClose: () => void }) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeToMeetingChat(meetingCode, setMessages), [meetingCode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    if (!text.trim() || !profile) return;
    sendMeetingChatMessage(meetingCode, profile.uid, profile.displayName, text);
    setText('');
  }

  return (
    <div
      style={{
        width: 300,
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottom: '1px solid var(--color-border)' }}>
        <strong>Meeting chat</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GiAiSummaryButton onGenerate={() => summarizeMeeting(meetingCode)} />
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', color: 'var(--color-text-muted)' }} aria-label="Close"><X size={17} strokeWidth={1.75} /></button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-brand-700)' }}>{m.senderName}</div>
            <div style={{ fontSize: 14 }}>{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: 10, display: 'flex', gap: 6, borderTop: '1px solid var(--color-border)' }}>
        <input
          className="rb-input"
          placeholder="Message everyone"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="rb-btn rb-btn--primary" onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
