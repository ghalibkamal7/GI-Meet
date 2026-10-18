import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createMeeting } from './meetingService';
import { searchUsersByUsername } from '../../services/searchService';
import type { UserProfile } from '../../utils/types';

export function ScheduleMeetingModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [invited, setInvited] = useState<Map<string, UserProfile>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSearch(value: string) {
    setTerm(value);
    if (value.trim().length < 2 || !profile) {
      setResults([]);
      return;
    }
    setResults(await searchUsersByUsername(value, profile.uid));
  }

  function toggleInvite(user: UserProfile) {
    setInvited((prev) => {
      const next = new Map(prev);
      if (next.has(user.uid)) next.delete(user.uid);
      else next.set(user.uid, user);
      return next;
    });
  }

  async function handleSchedule() {
    if (!profile || !title.trim() || !date || !time) {
      setError('Title, date, and time are required.');
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`).getTime();
    if (scheduledAt <= Date.now()) {
      setError('Pick a time in the future.');
      return;
    }
    setSaving(true);
    await createMeeting({
      hostUid: profile.uid,
      title,
      description,
      scheduledAt,
      invitedUids: [profile.uid, ...Array.from(invited.keys())],
    });
    setSaving(false);
    onClose();
    navigate('/meetings');
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-label="Schedule meeting" style={{ width: 380, padding: 20, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 14 }}>Schedule meeting</h3>

        <input className="rb-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 10 }} />
        <textarea className="rb-input" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ marginBottom: 10 }} />

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input className="rb-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="rb-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>

        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Invite participants</label>
        <input className="rb-input" placeholder="Search by username..." value={term} onChange={(e) => handleSearch(e.target.value)} style={{ marginBottom: 8 }} />
        {invited.size > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {Array.from(invited.values()).map((u) => (
              <span key={u.uid} onClick={() => toggleInvite(u)} style={{ fontSize: 12, background: 'var(--color-brand-100)', color: 'var(--color-brand-600)', padding: '4px 8px', borderRadius: 999, cursor: 'pointer' }}>
                {u.displayName} ✕
              </span>
            ))}
          </div>
        )}
        <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 12 }}>
          {results.map((u) => (
            <button key={u.uid} onClick={() => toggleInvite(u)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '6px 4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
              <span>{u.displayName}</span>
              <span>{invited.has(u.uid) ? '✓' : ''}</span>
            </button>
          ))}
        </div>

        {error && <p className="rb-error-text" style={{ marginBottom: 10 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="rb-btn rb-btn--outline" onClick={onClose}>Cancel</button>
          <button className="rb-btn rb-btn--primary" onClick={handleSchedule} disabled={saving}>
            {saving ? 'Scheduling…' : 'Schedule'}
          </button>
        </div>
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
