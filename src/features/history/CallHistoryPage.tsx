import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { PhoneMissed, PhoneIncoming, PhoneOutgoing, Phone } from 'lucide-react';
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
    <div className="rb-page rb-page--narrow rb-calls-page">
      <header className="rb-calls-header">
        <div>
          <span className="rb-eyebrow">Stay in the loop</span>
          <h1>Calls</h1>
          <p>Your recent voice and video conversations.</p>
        </div>
        <div className="rb-calls-header__mark" aria-hidden="true"><Phone size={22} /></div>
      </header>
      {entries.length === 0 && (
        <div className="rb-empty-state rb-calls-empty">
          <div className="rb-empty-state__icon"><Phone size={20} /></div>
          <h2>No calls yet</h2>
          <p>Calls with your contacts will show up here.</p>
        </div>
      )}
      {entries.map((entry) => (
        <div key={entry.id} className="rb-call-history-row">
          <span className={`rb-call-history-row__icon${entry.outcome === 'missed' ? ' is-missed' : ''}`}>{icon(entry)}</span>
          <div className="rb-call-history-row__identity">
            <div className="rb-call-history-row__name">{entry.otherName}</div>
            <div className={`rb-call-history-row__type${entry.outcome === 'missed' ? ' is-missed' : ''}`}>
              {label(entry)}
            </div>
          </div>
          <div className="rb-call-history-row__time">
            <div>{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            {entry.durationSeconds > 0 && <div>{Math.round(entry.durationSeconds / 60)} min</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
