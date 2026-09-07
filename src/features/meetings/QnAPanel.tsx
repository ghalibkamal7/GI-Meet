import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { subscribeToQuestions, askQuestion, toggleUpvote, markAnswered, type Question } from './qnaService';

export function QnAPanel({ meetingCode, currentUid, currentName, isHost, onClose }: { meetingCode: string; currentUid: string; currentName: string; isHost: boolean; onClose: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [text, setText] = useState('');

  useEffect(() => subscribeToQuestions(meetingCode, setQuestions), [meetingCode]);

  function handleAsk() {
    if (!text.trim()) return;
    askQuestion(meetingCode, currentUid, currentName, text);
    setText('');
  }

  return (
    <div style={{ width: 300, background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottom: '1px solid var(--color-border)' }}>
        <strong>Q&A</strong>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', color: 'var(--color-text-muted)' }} aria-label="Close"><X size={17} strokeWidth={1.75} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {questions.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No questions yet.</p>}
        {questions.map((q) => {
          const upvoted = q.upvotes.includes(currentUid);
          return (
            <div key={q.id} className="rb-card" style={{ padding: 10, marginBottom: 8, opacity: q.answered ? 0.6 : 1 }}>
              <div style={{ fontSize: 13 }}>{q.text}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>{q.askedByName}{q.answered ? ' · Answered' : ''}</span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => toggleUpvote(meetingCode, q.id, currentUid, upvoted)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: upvoted ? 'var(--color-brand-600)' : 'inherit' }}>
                    ▲ {q.upvotes.length}
                  </button>
                  {isHost && !q.answered && (
                    <button onClick={() => markAnswered(meetingCode, q.id, true)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                      Mark answered
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: 10, display: 'flex', gap: 6, borderTop: '1px solid var(--color-border)' }}>
        <input className="rb-input" placeholder="Ask a question" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAsk()} />
        <button className="rb-btn rb-btn--primary" onClick={handleAsk}>Ask</button>
      </div>
    </div>
  );
}
