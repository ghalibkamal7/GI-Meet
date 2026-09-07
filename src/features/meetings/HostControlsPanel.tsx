import { useState } from 'react';
import { X } from 'lucide-react';
import type { Room, RemoteParticipant } from 'livekit-client';
import { toggleLock, endMeeting, addCoHost, removeCoHost, admitFromWaitingRoom, denyFromWaitingRoom } from './meetingService';
import { authedFetch } from '../../services/authedFetch';
import type { Meeting } from './meetingTypes';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';

interface Props {
  meetingCode: string;
  room: Room;
  meeting: Meeting;
  onClose: () => void;
  onMeetingEnded: () => void;
}

export function HostControlsPanel({ meetingCode, room, meeting, onClose, onMeetingEnded }: Props) {
  const { showToast } = useToast();
  const [isLocked, setIsLocked] = useState(meeting.locked);
  const [removingParticipant, setRemovingParticipant] = useState<RemoteParticipant | null>(null);
  const [confirmingEndAll, setConfirmingEndAll] = useState(false);
  const participants = Array.from(room.remoteParticipants.values()) as RemoteParticipant[];

  async function handleToggleLock() {
    const next = !isLocked;
    setIsLocked(next);
    await toggleLock(meetingCode, next);
  }

  async function handleRemove(identity: string) {
    await authedFetch(`/api/meetings/${meetingCode}/kick`, { method: 'POST', body: JSON.stringify({ identity }) });
    setRemovingParticipant(null);
  }

  async function handleMute(identity: string, source: 'microphone' | 'camera') {
    await authedFetch(`/api/meetings/${meetingCode}/mute-participant`, { method: 'POST', body: JSON.stringify({ identity, source }) });
    showToast(source === 'microphone' ? 'Muted their microphone.' : 'Turned off their camera.', 'info');
  }

  async function handleEndForAll() {
    await endMeeting(meetingCode);
    onMeetingEnded();
  }

  return (
    <div style={{ width: 300, background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottom: '1px solid var(--color-border)' }}>
        <strong>Host controls</strong>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', color: 'var(--color-text-muted)' }} aria-label="Close"><X size={17} strokeWidth={1.75} /></button>
      </div>

      <div style={{ padding: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 14 }}>
          <input type="checkbox" checked={isLocked} onChange={handleToggleLock} />
          Lock meeting (no new joins)
        </label>

        {meeting.waitingParticipants.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Waiting room ({meeting.waitingParticipants.length})</div>
            {meeting.waitingParticipants.map((uid) => (
              <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{uid.slice(0, 8)}…</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="rb-btn rb-btn--primary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => admitFromWaitingRoom(meetingCode, uid)}>Admit</button>
                  <button className="rb-btn rb-btn--outline" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => denyFromWaitingRoom(meetingCode, uid)}>Deny</button>
                </div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '12px 0' }} />
          </>
        )}

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Participants ({participants.length + 1})</div>
        {participants.map((p) => {
          const isCoHost = meeting.coHosts.includes(p.identity);
          return (
            <div key={p.identity} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                <span>{p.name || p.identity} {isCoHost && <em style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>(co-host)</em>}</span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button className="rb-btn rb-btn--outline" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleMute(p.identity, 'microphone')}>Mute mic</button>
                <button className="rb-btn rb-btn--outline" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleMute(p.identity, 'camera')}>Turn off camera</button>
                <button
                  className="rb-btn rb-btn--outline"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => (isCoHost ? removeCoHost(meetingCode, p.identity) : addCoHost(meetingCode, p.identity))}
                >
                  {isCoHost ? 'Remove co-host' : 'Make co-host'}
                </button>
                <button className="rb-btn rb-btn--outline" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setRemovingParticipant(p)}>Remove</button>
              </div>
            </div>
          );
        })}

        <button className="rb-btn rb-btn--outline" style={{ width: '100%', marginTop: 20, color: 'var(--color-danger)' }} onClick={() => setConfirmingEndAll(true)}>
          End meeting for everyone
        </button>
      </div>

      {removingParticipant && (
        <ConfirmDialog
          title="Remove this participant?"
          message={`${removingParticipant.name || removingParticipant.identity} will be disconnected from the meeting immediately.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => handleRemove(removingParticipant.identity)}
          onCancel={() => setRemovingParticipant(null)}
        />
      )}

      {confirmingEndAll && (
        <ConfirmDialog
          title="End meeting for everyone?"
          message="This immediately disconnects every participant and closes the meeting. This can't be undone."
          confirmLabel="End meeting"
          danger
          onConfirm={handleEndForAll}
          onCancel={() => setConfirmingEndAll(false)}
        />
      )}
    </div>
  );
}
