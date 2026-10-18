import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMeeting } from './meetingService';

export function JoinMeetingModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    const meeting = await getMeeting(trimmed);
    if (!meeting) {
      setError("That meeting code doesn't exist.");
      return;
    }
    if (meeting.locked && meeting.endedAt) {
      setError('This meeting has ended.');
      return;
    }
    onClose();
    navigate(`/meeting/${trimmed}/lobby`);
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-label="Join meeting" style={{ width: 340, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Join with a code</h3>
        <input
          className="rb-input"
          placeholder="Meeting code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: 2 }}
          autoFocus
        />
        {error && <p className="rb-error-text" style={{ marginTop: 8 }}>{error}</p>}
        <button className="rb-btn rb-btn--primary" style={{ width: '100%', marginTop: 14 }} onClick={handleJoin}>
          Join
        </button>
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
  zIndex: 100,
};
