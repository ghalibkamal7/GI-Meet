import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video as VideoIcon, VideoOff, Copy, Link2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMeetingLobbyPreview, verifyMeetingPassword } from './meetingService';
import type { MeetingLobbyPreview } from './meetingService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export function MeetingLobby() {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [meeting, setMeeting] = useState<MeetingLobbyPreview | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loadingMeeting, setLoadingMeeting] = useState(true);
  const [joining, setJoining] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMeeting() {
      if (!meetingCode) {
        setError("This meeting doesn't exist.");
        setLoadingMeeting(false);
        return;
      }
      try {
        const result = await getMeetingLobbyPreview(meetingCode);
        if (cancelled) return;
        if (!result) {
          setError("This meeting doesn't exist.");
        } else {
          setMeeting(result);
          setCameraOn(!result.isAudioOnly);
        }
      } catch {
        if (!cancelled) setError('Could not load this meeting. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoadingMeeting(false);
      }
    }
    void loadMeeting();
    return () => {
      cancelled = true;
    };
  }, [meetingCode]);

  useEffect(() => {
    if (!meeting) return;
    let cancelled = false;
    async function setupPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: cameraOn, audio: micOn });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError('Could not access camera/microphone. You can still join with them off.');
      }
    }
    setupPreview();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [meeting, cameraOn, micOn]);

  async function handleJoin() {
    if (!meeting || !meetingCode || joining) return;
    if (meeting.locked) {
      setError(meeting.ended ? 'This meeting has ended.' : 'This meeting is locked by the host.');
      return;
    }
    setJoining(true);
    setPasswordError(null);
    setError(null);
    try {
      if (meeting.hasPassword) {
        if (!password) {
          setPasswordError('Enter the meeting password.');
          return;
        }
        const ok = await verifyMeetingPassword(meetingCode, password);
        if (!ok) {
          setPasswordError('Incorrect password.');
          return;
        }
      }
      navigate(`/meeting/${meetingCode}/room`, { state: { cameraOn, micOn } });
    } catch (error) {
      setPasswordError(error instanceof Error && error.message
        ? error.message
        : 'Could not verify the meeting password. Check your connection and retry.');
    } finally {
      setJoining(false);
    }
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyStatus(`${label} copied.`);
      window.setTimeout(() => {
        setCopied(false);
        setCopyStatus(null);
      }, 1500);
    } catch {
      setCopied(false);
      setCopyStatus(`Could not access the clipboard. Select and copy the ${label.toLowerCase()} manually.`);
    }
  }

  function handleCopyCode() {
    if (meetingCode) void copyToClipboard(meetingCode, 'Meeting code');
  }

  function handleCopyLink() {
    if (meetingCode) void copyToClipboard(`${window.location.origin}/meeting/${meetingCode}/lobby`, 'Meeting link');
  }

  if (loadingMeeting) {
    return <LoadingSpinner label="Loading meeting…" />;
  }

  if (error && !meeting) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p>{error}</p>
        <button className="rb-btn rb-btn--outline" onClick={() => navigate('/meetings')}>Back to meetings</button>
      </div>
    );
  }

  return (
    <div className="rb-meeting-lobby" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24, overflowY: 'auto' }}>
      <h2>Ready to join?</h2>

      <div
        className="rb-meeting-code"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 10,
          background: 'var(--color-surface-alt)',
          border: '1px solid var(--color-border)',
          borderRadius: 999,
          padding: '8px 8px 8px 18px',
          maxWidth: '100%',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: 2, fontSize: 15 }}>{meetingCode}</span>
        <button className="rb-btn rb-btn--outline" style={{ padding: '4px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }} onClick={handleCopyCode}>
          <Copy size={13} strokeWidth={1.75} /> Copy code
        </button>
        <button className="rb-btn rb-btn--outline" style={{ padding: '4px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }} onClick={handleCopyLink}>
          <Link2 size={13} strokeWidth={1.75} /> Copy link
        </button>
      </div>
      {(copied || copyStatus) && (
        <span role="status" style={{ fontSize: 12, color: copied ? 'var(--color-brand-600)' : 'var(--color-danger)' }}>
          {copyStatus}
        </span>
      )}
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 320, textAlign: 'center', marginTop: -12 }}>
        Share this code or link with people you want to join this meeting.
        {meeting?.waitingRoomEnabled && ' A waiting room is on — the host must let you in.'}
      </p>

      {!meeting?.isAudioOnly && (
        <div
          className="rb-meeting-preview"
          style={{
            width: 'min(360px, 100%)',
            maxWidth: '100%',
            height: 240,
            background: '#0b0f0e',
            borderRadius: 16,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {cameraOn ? (
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ color: '#fff' }}>Camera off</div>
          )}
        </div>
      )}

      <div className="rb-meeting-lobby__controls" style={{ display: 'flex', gap: 10 }}>
        <button className={`rb-btn ${micOn ? 'rb-btn--primary' : 'rb-btn--outline'}`} onClick={() => setMicOn((v) => !v)} style={btnWithIcon}>
          {micOn ? <Mic size={16} strokeWidth={1.75} /> : <MicOff size={16} strokeWidth={1.75} />} {micOn ? 'Mic on' : 'Mic off'}
        </button>
        {!meeting?.isAudioOnly && (
          <button className={`rb-btn ${cameraOn ? 'rb-btn--primary' : 'rb-btn--outline'}`} onClick={() => setCameraOn((v) => !v)} style={btnWithIcon}>
            {cameraOn ? <VideoIcon size={16} strokeWidth={1.75} /> : <VideoOff size={16} strokeWidth={1.75} />} {cameraOn ? 'Camera on' : 'Camera off'}
          </button>
        )}
      </div>

      {meeting?.hasPassword && (
        <div style={{ width: 'min(260px, 100%)' }}>
          <input
            className="rb-input"
            type="password"
            placeholder="Meeting password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {passwordError && <p className="rb-error-text" style={{ marginTop: 6 }}>{passwordError}</p>}
        </div>
      )}

      {error && <p className="rb-error-text">{error}</p>}

      <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Name: {profile?.displayName}</div>

      <button
        className="rb-btn rb-btn--primary"
        style={{ padding: '12px 32px' }}
        onClick={handleJoin}
        disabled={!meeting || meeting.locked || joining}
      >
        {joining ? 'Verifying…' : meeting?.locked ? 'Meeting locked' : 'Join Meeting'}
      </button>
    </div>
  );
}

const btnWithIcon: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7 };
