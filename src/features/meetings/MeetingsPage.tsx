import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createMeeting, subscribeToUserMeetingHistory, getUpcomingMeetings } from './meetingService';
import { JoinMeetingModal } from './JoinMeetingModal';
import { ScheduleMeetingModal } from './ScheduleMeetingModal';
import type { Meeting } from './meetingTypes';
import { Video, Phone, Link2, CalendarPlus } from 'lucide-react';

export function MeetingsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [showJoin, setShowJoin] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof subscribeToUserMeetingHistory>>>([]);
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);

  useEffect(() => {
    if (!profile) return;
    subscribeToUserMeetingHistory(profile.uid).then(setHistory);
    getUpcomingMeetings(profile.uid).then(setUpcoming);
  }, [profile]);

  async function handleNewMeeting(audioOnly: boolean) {
    if (!profile) return;
    const code = await createMeeting({ hostUid: profile.uid, title: `${profile.displayName}'s meeting`, isAudioOnly: audioOnly });
    navigate(`/meeting/${code}/lobby`);
  }

  function groupByDay(entries: typeof history) {
    const groups: Record<string, typeof history> = {};
    entries.forEach((entry) => {
      const label = new Date(entry.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      groups[label] = groups[label] ? [...groups[label], entry] : [entry];
    });
    return groups;
  }

  const grouped = groupByDay(history);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Meetings</h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="rb-btn rb-btn--primary" style={btnRowStyle} onClick={() => handleNewMeeting(false)}><Video size={16} strokeWidth={1.75} /> New meeting</button>
        <button className="rb-btn rb-btn--outline" style={btnRowStyle} onClick={() => handleNewMeeting(true)}><Phone size={16} strokeWidth={1.75} /> New voice call</button>
        <button className="rb-btn rb-btn--outline" style={btnRowStyle} onClick={() => setShowJoin(true)}><Link2 size={16} strokeWidth={1.75} /> Join with code</button>
        <button className="rb-btn rb-btn--outline" style={btnRowStyle} onClick={() => setShowSchedule(true)}><CalendarPlus size={16} strokeWidth={1.75} /> Schedule</button>
      </div>

      {upcoming.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Upcoming</h2>
          {upcoming.map((m) => (
            <div key={m.id} className="rb-card" style={{ padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {m.scheduledAt && new Date(m.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button className="rb-btn rb-btn--outline" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => navigate(`/meeting/${m.id}/lobby`)}>
                Join
              </button>
            </div>
          ))}
        </>
      )}

      <h2 style={{ fontSize: 16, margin: '20px 0 12px' }}>History</h2>
      {history.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No past meetings yet.</p>}
      {Object.entries(grouped).map(([day, entries]) => (
        <div key={day} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>{day}</div>
          {entries.map((entry) => (
            <div key={entry.id} className="rb-card" style={{ padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {new Date(entry.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {entry.durationMinutes} min
              </div>
            </div>
          ))}
        </div>
      ))}

      {showJoin && <JoinMeetingModal onClose={() => setShowJoin(false)} />}
      {showSchedule && <ScheduleMeetingModal onClose={() => setShowSchedule(false)} />}
    </div>
  );
}

const btnRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7 };
