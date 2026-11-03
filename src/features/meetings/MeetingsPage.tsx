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
    <div className="rb-page rb-meetings-page">
      <header className="rb-meetings-header">
        <div>
          <span className="rb-eyebrow">Make time to connect</span>
          <h1>Meetings</h1>
          <p>Start a call, join with a code, or plan it for later.</p>
        </div>
        <div className="rb-meetings-header__mark" aria-hidden="true"><Video size={24} /></div>
      </header>

      <div className="rb-meetings-actions">
        <button className="rb-btn rb-btn--primary" onClick={() => handleNewMeeting(false)}><Video size={17} strokeWidth={1.75} /> New meeting</button>
        <button className="rb-btn rb-btn--outline" onClick={() => handleNewMeeting(true)}><Phone size={17} strokeWidth={1.75} /> New voice call</button>
        <button className="rb-btn rb-btn--outline" onClick={() => setShowJoin(true)}><Link2 size={17} strokeWidth={1.75} /> Join with code</button>
        <button className="rb-btn rb-btn--outline" onClick={() => setShowSchedule(true)}><CalendarPlus size={17} strokeWidth={1.75} /> Schedule</button>
      </div>

      {upcoming.length > 0 && (
        <section className="rb-meetings-section">
          <h2 className="rb-section-title">Coming up</h2>
          {upcoming.map((m) => (
            <div key={m.id} className="rb-card rb-meeting-list-card">
              <div className="rb-meeting-list-card__main">
                <div className="rb-meeting-list-card__icon"><Video size={17} /></div>
                <div className="rb-meeting-list-card__text">
                  <div className="rb-meeting-list-card__title">{m.title}</div>
                  <div className="rb-meeting-list-card__meta">
                  {m.scheduledAt && new Date(m.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <button className="rb-btn rb-btn--outline" onClick={() => navigate(`/meeting/${m.id}/lobby`)}>
                Join
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="rb-meetings-section">
        <h2 className="rb-section-title">Recent meetings</h2>
        {history.length === 0 && <div className="rb-empty-state rb-meetings-empty"><p>No past meetings yet. Your recent calls will appear here.</p></div>}
        {Object.entries(grouped).map(([day, entries]) => (
          <div key={day} className="rb-meeting-day">
            <div className="rb-meeting-day__label">{day}</div>
            {entries.map((entry) => (
              <div key={entry.id} className="rb-card rb-meeting-history-card">
                <div className="rb-meeting-list-card__icon"><Video size={17} /></div>
                <div className="rb-meeting-history-card__text">
                  <div className="rb-meeting-list-card__title">{entry.title}</div>
                  <div className="rb-meeting-list-card__meta">
                    {new Date(entry.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {entry.durationMinutes} min
                  </div>
                </div>
                <span className="rb-meeting-history-card__duration">{entry.durationMinutes} min</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      {showJoin && <JoinMeetingModal onClose={() => setShowJoin(false)} />}
      {showSchedule && <ScheduleMeetingModal onClose={() => setShowSchedule(false)} />}
    </div>
  );
}
