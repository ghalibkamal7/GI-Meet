import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import { useAuth } from '../../context/AuthContext';
import { connectToRoom, toggleScreenShare } from './livekitClient';
import { subscribeToMeeting, joinMeeting, leaveMeeting, endMeeting } from './meetingService';
import type { Meeting } from './meetingTypes';
import { ParticipantTile } from './ParticipantTile';
import { MeetingChatPanel } from './MeetingChatPanel';
import { HostControlsPanel } from './HostControlsPanel';
import { QnAPanel } from './QnAPanel';
import { DeviceSettingsModal } from './DeviceSettingsModal';
import { MeetingInfoModal } from './MeetingInfoModal';
import { broadcastLiveEvent, subscribeToLiveEvents } from './liveEvents';
import { GoLiveModal } from '../youtube-live/GoLiveModal';
import { LiveControls, LiveIndicatorBanner } from '../youtube-live/LiveControls';
import { subscribeToLiveStreamState, type LiveStreamState } from '../youtube-live/youtubeLiveService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { soundService } from '../../services/soundService';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  ScreenShare,
  Hand,
  Settings2,
  MessageSquare,
  HelpCircle,
  Users,
  PhoneOff,
  Radio,
  Info,
  Copy,
  Smile,
  Loader2,
} from 'lucide-react';

type Panel = 'none' | 'chat' | 'host' | 'qna';

export function MeetingRoom() {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const joinOptions = (location.state as { cameraOn?: boolean; micOn?: boolean }) ?? {};
  const [room, setRoom] = useState<Room | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [micOn, setMicOn] = useState(joinOptions.micOn ?? true);
  const [cameraOn, setCameraOn] = useState(joinOptions.cameraOn ?? true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  const [showGoLive, setShowGoLive] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [liveState, setLiveState] = useState<LiveStreamState | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: number; emoji: string }>>([]);
  const [myHandRaised, setMyHandRaised] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const roomRef = useRef<Room | null>(null);

  const isHost = Boolean(meeting && profile && meeting.hostUid === profile.uid);
  const isCoHost = Boolean(meeting && profile && meeting.coHosts.includes(profile.uid));
  const isHostOrCoHost = isHost || isCoHost;

  useEffect(() => {
    if (!meetingCode) return;
    return subscribeToMeeting(meetingCode, setMeeting);
  }, [meetingCode]);

  useEffect(() => {
    if (!meetingCode) return;
    return subscribeToLiveStreamState(meetingCode, setLiveState);
  }, [meetingCode]);

  // If waiting-room admission happens (meeting doc moves us from waiting to
  // active) while we're still stuck on the "waiting for host" screen, retry.
  useEffect(() => {
    if (!waiting || !meeting || !profile) return;
    if (meeting.activeParticipants.includes(profile.uid)) setWaiting(false);
    if (!meeting.waitingParticipants.includes(profile.uid) && !meeting.activeParticipants.includes(profile.uid)) {
      setConnectError('The host denied your request to join.');
    }
  }, [meeting, waiting, profile]);

  useEffect(() => {
    if (!meetingCode || !profile || waiting) return;
    let activeRoom: Room | null = null;

    async function join() {
      try {
        const result = await joinMeeting(meetingCode!, profile!.uid);
        if (result.waiting) {
          setWaiting(true);
          return;
        }

        const { room: connectedRoom } = await connectToRoom({
          roomName: meetingCode!,
          participantName: profile!.displayName,
          cameraOn: joinOptions.cameraOn ?? true,
          micOn: joinOptions.micOn ?? true,
        });
        activeRoom = connectedRoom;
        roomRef.current = connectedRoom;
        setRoom(connectedRoom);
        setParticipants(Array.from(connectedRoom.remoteParticipants.values()));

        const refreshParticipants = () => setParticipants(Array.from(connectedRoom.remoteParticipants.values()));
        connectedRoom.on(RoomEvent.ParticipantConnected, () => {
          refreshParticipants();
          soundService.playJoinChime();
        });
        connectedRoom.on(RoomEvent.ParticipantDisconnected, () => {
          refreshParticipants();
          soundService.playLeaveChime();
        });
        connectedRoom.on(RoomEvent.TrackSubscribed, refreshParticipants);
        connectedRoom.on(RoomEvent.Disconnected, () => navigate('/meetings'));
        connectedRoom.on(RoomEvent.Reconnecting, () => setReconnecting(true));
        connectedRoom.on(RoomEvent.Reconnected, () => setReconnecting(false));

        subscribeToLiveEvents(connectedRoom, (payload) => {
          if (payload.type === 'reaction') {
            const id = Date.now() + Math.random();
            setFloatingReactions((prev) => [...prev, { id, emoji: payload.emoji }]);
            setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2500);
          } else if (payload.type === 'raise-hand') {
            setRaisedHands((prev) => {
              const next = new Set(prev);
              if (payload.on) next.add(payload.from);
              else next.delete(payload.from);
              return next;
            });
          }
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'meeting-locked') {
          setConnectError('This meeting is locked by the host.');
        } else if (err instanceof Error && err.message === 'meeting-not-found') {
          setConnectError("This meeting doesn't exist.");
        } else {
          setConnectError('Could not connect to the meeting. Check your network and try again.');
        }
      }
    }

    join();

    return () => {
      activeRoom?.disconnect();
      if (meetingCode && profile) leaveMeeting(meetingCode, profile.uid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingCode, profile, waiting]);

  async function handleToggleMic() {
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function handleToggleCamera() {
    if (!room) return;
    const next = !cameraOn;
    await room.localParticipant.setCameraEnabled(next);
    setCameraOn(next);
  }

  async function handleToggleScreenShare() {
    if (!room) return;
    try {
      const next = !screenSharing;
      await toggleScreenShare(room, next);
      setScreenSharing(next);
    } catch {
      // User cancelled the browser's share picker, or the browser doesn't support it — no-op.
    }
  }

  function handleReact(emoji: string) {
    if (!room || !profile) return;
    broadcastLiveEvent(room, { type: 'reaction', emoji, from: profile.uid });
    const id = Date.now();
    setFloatingReactions((prev) => [...prev, { id, emoji }]);
    setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2500);
  }

  function handleToggleRaiseHand() {
    if (!room || !profile) return;
    const next = !myHandRaised;
    setMyHandRaised(next);
    broadcastLiveEvent(room, { type: 'raise-hand', on: next, from: profile.uid });
  }

  async function handleLeave() {
    room?.disconnect();
    if (meetingCode && profile) await leaveMeeting(meetingCode, profile.uid);
    navigate('/meetings');
  }

  async function handleEndForAll() {
    if (!meetingCode) return;
    await endMeeting(meetingCode);
    room?.disconnect();
    navigate('/meetings');
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(meetingCode ?? '');
  }

  if (waiting) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <LoadingSpinner label="Waiting for the host to let you in…" />
        <button className="rb-btn rb-btn--outline" onClick={() => navigate('/meetings')}>Cancel</button>
      </div>
    );
  }

  if (connectError) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p className="rb-error-text">{connectError}</p>
        <button className="rb-btn rb-btn--outline" onClick={() => navigate('/meetings')}>Back to meetings</button>
      </div>
    );
  }

  if (!room || !profile || !meeting) return <LoadingSpinner label="Joining meeting…" />;

  const isLive = liveState?.status === 'live';

  return (
    <div className="rb-meeting-room" style={{ height: '100%', display: 'flex', position: 'relative', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#0b0f0e' }}>
        {isLive && <LiveIndicatorBanner />}
        {reconnecting && (
          <div role="status" aria-live="polite" style={{ position: 'absolute', top: isLive ? 32 : 0, left: 0, right: 0, background: 'var(--color-accent)', color: '#1a1400', textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '4px 0', zIndex: 55 }}>
            <Loader2 className="rb-spin" size={14} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} /> Reconnecting…
          </div>
        )}
        {!isLive && (
          <button onClick={handleCopyCode} title="Copy meeting code" style={codeChipStyle}>
            <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>{meetingCode}</span>
            <Copy size={13} strokeWidth={1.75} />
          </button>
        )}
        {isHost && liveState && liveState.status !== 'not_connected' && liveState.status !== 'ended' && (
          <LiveControls meetingCode={meetingCode!} state={liveState} />
        )}

        <button onClick={() => setShowInfo(true)} title="Meeting info" style={{ ...codeChipStyle, left: 'auto', right: 16 }}>
          <Info size={14} strokeWidth={1.75} /> Info
        </button>

        {/* Floating reactions */}
        <div style={{ position: 'absolute', bottom: 90, left: 0, right: 0, height: 0, pointerEvents: 'none' }}>
          {floatingReactions.map((r, i) => (
            <span
              key={r.id}
              style={{
                position: 'absolute',
                left: `${20 + ((i * 37) % 60)}%`,
                fontSize: 28,
                animation: 'rb-float-up 2.5s ease-out forwards',
              }}
            >
              {r.emoji}
            </span>
          ))}
        </div>
        <style>{`@keyframes rb-float-up { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-140px); opacity: 0; } }`}</style>

        <div
          className="rb-meeting-participant-grid"
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(3, participants.length + 1)}, 1fr)`,
            gap: 12,
            padding: isLive ? '40px 16px 16px' : 16,
            alignContent: 'center',
            overflowY: 'auto',
          }}
        >
          <ParticipantTile participant={room.localParticipant} isLocal handRaised={myHandRaised} />
          {participants.map((p) => (
            <ParticipantTile key={p.identity} participant={p} isLocal={false} handRaised={raisedHands.has(p.identity)} />
          ))}
        </div>

        <div className="rb-meeting-controls" style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '14px 0', background: 'rgba(0,0,0,0.3)', flexWrap: 'wrap' }}>
          <button onClick={handleToggleMic} style={ctrlBtn(!micOn)} title={micOn ? 'Mute mic' : 'Unmute mic'} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
            {micOn ? <Mic size={19} strokeWidth={1.75} /> : <MicOff size={19} strokeWidth={1.75} />}
          </button>
          {!meeting.isAudioOnly && (
            <button onClick={handleToggleCamera} style={ctrlBtn(!cameraOn)} title={cameraOn ? 'Turn off camera' : 'Turn on camera'} aria-label={cameraOn ? 'Turn off camera' : 'Turn on camera'}>
              {cameraOn ? <VideoIcon size={19} strokeWidth={1.75} /> : <VideoOff size={19} strokeWidth={1.75} />}
            </button>
          )}
          {!meeting.isAudioOnly && (
            <button onClick={handleToggleScreenShare} style={ctrlBtn(!screenSharing)} title="Share screen" aria-label="Share screen">
              <ScreenShare size={19} strokeWidth={1.75} />
            </button>
          )}
          <button onClick={handleToggleRaiseHand} style={ctrlBtn(!myHandRaised)} title="Raise hand" aria-label={myHandRaised ? 'Lower hand' : 'Raise hand'}>
            <Hand size={19} strokeWidth={1.75} />
          </button>
          <ReactionButton onReact={handleReact} />
          <button onClick={() => setShowDeviceSettings(true)} style={ctrlBtn(true)} title="Device settings" aria-label="Device settings">
            <Settings2 size={19} strokeWidth={1.75} />
          </button>
          <button onClick={() => setPanel(panel === 'chat' ? 'none' : 'chat')} style={ctrlBtn(panel !== 'chat')} title="Meeting chat" aria-label={panel === 'chat' ? 'Close meeting chat' : 'Open meeting chat'}>
            <MessageSquare size={19} strokeWidth={1.75} />
          </button>
          <button onClick={() => setPanel(panel === 'qna' ? 'none' : 'qna')} style={ctrlBtn(panel !== 'qna')} title="Q&A" aria-label={panel === 'qna' ? 'Close Q&A' : 'Open Q&A'}>
            <HelpCircle size={19} strokeWidth={1.75} />
          </button>
          {isHostOrCoHost && (
            <button onClick={() => setPanel(panel === 'host' ? 'none' : 'host')} style={ctrlBtn(panel !== 'host')} title="Host controls" aria-label={panel === 'host' ? 'Close host controls' : 'Open host controls'}>
              <Users size={19} strokeWidth={1.75} />
            </button>
          )}
          {isHost && (!liveState || liveState.status === 'not_connected' || liveState.status === 'ended') && (
            <button onClick={() => setShowGoLive(true)} style={{ ...ctrlBtn(false), background: 'var(--color-danger)', width: 'auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7 }} title="Go live on YouTube" aria-label="Go live on YouTube">
              <Radio size={17} strokeWidth={1.75} /> Go Live
            </button>
          )}
          <button onClick={isHost ? () => setShowEndConfirm(true) : handleLeave} style={{ ...ctrlBtn(false), background: 'var(--color-danger)' }} title="Leave meeting" aria-label={isHost ? 'End meeting' : 'Leave meeting'}>
            <PhoneOff size={19} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {panel === 'chat' && <MeetingChatPanel meetingCode={meetingCode!} onClose={() => setPanel('none')} />}
      {panel === 'qna' && (
        <QnAPanel meetingCode={meetingCode!} currentUid={profile.uid} currentName={profile.displayName} isHost={isHostOrCoHost} onClose={() => setPanel('none')} />
      )}
      {panel === 'host' && meeting && (
        <HostControlsPanel
          meetingCode={meetingCode!}
          room={room}
          meeting={meeting}
          onClose={() => setPanel('none')}
          onMeetingEnded={() => navigate('/meetings')}
        />
      )}

      {showGoLive && meetingCode && (
        <GoLiveModal meetingCode={meetingCode} onClose={() => setShowGoLive(false)} onStarted={() => setShowGoLive(false)} />
      )}
      {showDeviceSettings && <DeviceSettingsModal room={room} onClose={() => setShowDeviceSettings(false)} />}
      {showInfo && <MeetingInfoModal meeting={meeting} participantCount={participants.length + 1} onClose={() => setShowInfo(false)} />}

      {showEndConfirm && (
        <ConfirmDialog
          title="End meeting for everyone?"
          message="This immediately disconnects every participant and closes the meeting. This can't be undone."
          confirmLabel="End meeting"
          danger
          onConfirm={async () => {
            setShowEndConfirm(false);
            await handleEndForAll();
          }}
          onCancel={() => setShowEndConfirm(false)}
        />
      )}
    </div>
  );
}

function ReactionButton({ onReact }: { onReact: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const emojis = ['👍', '❤️', '😂', '👏', '🎉'];
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} style={ctrlBtn(true)} title="Send a reaction" aria-label="Send a reaction">
        <Smile size={19} strokeWidth={1.75} />
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, background: 'var(--color-surface)', borderRadius: 12, padding: 6, display: 'flex', gap: 4, boxShadow: 'var(--shadow-md)' }}>
          {emojis.map((e) => (
            <button key={e} onClick={() => { onReact(e); setOpen(false); }} style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }} aria-label={`React with ${e}`}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const codeChipStyle: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  zIndex: 40,
  background: 'rgba(0,0,0,0.55)',
  color: '#fff',
  border: 'none',
  borderRadius: 999,
  padding: '7px 14px',
  fontSize: 12.5,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  cursor: 'pointer',
};

function ctrlBtn(muted: boolean): React.CSSProperties {
  return {
    width: 46,
    height: 46,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: muted ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.28)',
    color: '#fff',
    transition: 'background 0.12s ease',
  };
}
