import { useState } from 'react';
import { createPoll, votePoll, closePoll, type Poll } from './pollService';

type ParentType = 'chats' | 'groups' | 'meetings' | 'rooms';

export function CreatePollModal({
  parentType,
  parentId,
  createdBy,
  onClose,
}: {
  parentType: ParentType;
  parentId: string;
  createdBy: string;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function handleCreate() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;
    await createPoll(parentType, parentId, { question, options: cleanOptions, allowMultiple, createdBy });
    onClose();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 360, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Create poll</h3>
        <input className="rb-input" placeholder="Question" value={question} onChange={(e) => setQuestion(e.target.value)} style={{ marginBottom: 10 }} />
        {options.map((opt, i) => (
          <input
            key={i}
            className="rb-input"
            placeholder={`Option ${i + 1}`}
            value={opt}
            onChange={(e) => updateOption(i, e.target.value)}
            style={{ marginBottom: 8 }}
          />
        ))}
        <button className="rb-btn rb-btn--outline" style={{ marginBottom: 10, fontSize: 13 }} onClick={() => setOptions((prev) => [...prev, ''])}>
          + Add option
        </button>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
          Allow selecting multiple options
        </label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="rb-btn rb-btn--outline" onClick={onClose}>Cancel</button>
          <button className="rb-btn rb-btn--primary" onClick={handleCreate}>Create</button>
        </div>
      </div>
    </div>
  );
}

export function PollCard({
  poll,
  parentType,
  parentId,
  currentUid,
  isCreator,
}: {
  poll: Poll;
  parentType: ParentType;
  parentId: string;
  currentUid: string;
  isCreator: boolean;
}) {
  const myVotes = poll.votes[currentUid] ?? [];
  const totalVoters = Object.keys(poll.votes).length;

  function countFor(optionIndex: number) {
    return Object.values(poll.votes).filter((v) => v.includes(optionIndex)).length;
  }

  async function handleVote(optionIndex: number) {
    if (poll.closed) return;
    let next: number[];
    if (poll.allowMultiple) {
      next = myVotes.includes(optionIndex) ? myVotes.filter((i) => i !== optionIndex) : [...myVotes, optionIndex];
    } else {
      next = myVotes.includes(optionIndex) ? [] : [optionIndex];
    }
    await votePoll(parentType, parentId, poll.id, currentUid, next);
  }

  return (
    <div className="rb-card" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{poll.question}</div>
      {poll.options.map((option, i) => {
        const count = countFor(i);
        const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
        const selected = myVotes.includes(i);
        return (
          <button
            key={i}
            onClick={() => handleVote(i)}
            disabled={poll.closed}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              marginBottom: 6,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${selected ? 'var(--color-brand-600)' : 'var(--color-border)'}`,
              background: selected ? 'var(--color-brand-100)' : 'var(--color-surface-alt)',
              position: 'relative',
              cursor: poll.closed ? 'default' : 'pointer',
              fontSize: 14,
            }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between' }}>
              <span>{option}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{count} · {pct}%</span>
            </div>
          </button>
        );
      })}
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>{totalVoters} vote{totalVoters !== 1 ? 's' : ''}{poll.closed ? ' · Closed' : ''}</span>
        {isCreator && !poll.closed && (
          <button onClick={() => closePoll(parentType, parentId, poll.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-brand-600)' }}>
            Close poll
          </button>
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
