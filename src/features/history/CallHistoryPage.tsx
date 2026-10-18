import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { PhoneMissed, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { db } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';

interface CallHistoryEntry {
  id: string;
  otherName: string;
  type: 'voice' | 'video';
  direction: 'incoming' | 'outgoing';
  outcome: 'completed' | 'missed' | 'rejected';
  durationSeconds: number;
  createdAt: number;
}

export function CallHistoryPage() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<CallHistoryEntry[]>([]);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'users', profile.uid, 'callHistory'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      setEntries(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            otherName: data.otherName,
            type: data.type,
            direction: data.direction,
            outcome: data.outcome,
            durationSeconds: data.durationSeconds,
            createdAt: data.createdAt?.toMillis?.() ?? 0,
          };
        })
      );
    });
  }, [profile]);

  function icon(entry: CallHistoryEntry) {
    if (entry.outcome === 'missed') return <PhoneMissed size={17} strokeWidth={1.75} color="var(--color-danger)" />;
    return entry.direction === 'incoming' ? <PhoneIncoming size={17} strokeWidth={1.75} /> : <PhoneOutgoing size={17} strokeWidth={1.75} />;
  }

  function label(entry: CallHistoryEntry) {
    const kind = entry.type === 'video' ? 'Video call' : 'Voice call';
    if (entry.outcome === 'missed') return `Missed ${kind.toLowerCase()}`;
    return kind;
  }

  return (
    <div className="rb-page rb-page--narrow">
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Calls</h1>
      {entries.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No calls yet.</p>}
      {entries.map((entry) => (
        <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ display: 'flex' }}>{icon(entry)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.otherName}</div>
            <div style={{ fontSize: 12, color: entry.outcome === 'missed' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
              {label(entry)}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'right' }}>
            <div>{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            {entry.durationSeconds > 0 && <div>{Math.round(entry.durationSeconds / 60)} min</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
