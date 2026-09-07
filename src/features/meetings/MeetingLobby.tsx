import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video as VideoIcon, VideoOff, Copy, Link2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMeeting, verifyMeetingPassword } from './meetingService';
import type { Meeting } from './meetingTypes';

export function MeetingLobby() {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!meetingCode) return;
    getMeeting(meetingCode).then((m) => {
      if (!m) {
        setError("This meeting doesn't exist.");
      } else {
        setMeeting(m);
        setCameraOn(!m.isAudioOnly);
      }
    });
  }, [meetingCode]);

  useEffect(() => {
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
  }, [cameraOn, micOn]);

  async function handleJoin() {
    if (meeting?.hasPassword) {
      const ok = await verifyMeetingPassword(meetingCode!, password);
      if (!ok) {
        setPasswordError('Incorrect password.');
        return;
      }
    }
    navigate(`/meeting/${meetingCode}/room`, { state: { cameraOn, micOn } });
  }

  function handleCopyCode() {
    if (!meetingCode) return;
    navigator.clipboard.writeText(meetingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/meeting/${meetingCode}/lobby`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
      <h2>Ready to join?</h2>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--color-surface-alt)',
          border: '1px solid var(--color-border)',
          borderRadius: 999,
          padding: '8px 8px 8px 18px',
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
      {copied && <span style={{ fontSize: 12, color: 'var(--color-brand-600)' }}>Copied!</span>}
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 320, textAlign: 'center', marginTop: -12 }}>
        Share this code or link with people you want to join this meeting.
        {meeting?.waitingRoomEnabled && ' A waiting room is on — the host must let you in.'}
      </p>

      {!meeting?.isAudioOnly && (
        <div
          style={{
            width: 360,
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

      <div style={{ display: 'flex', gap: 10 }}>
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
        <div style={{ width: 260 }}>
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

      <button className="rb-btn rb-btn--primary" style={{ padding: '12px 32px' }} onClick={handleJoin}>
        Join Meeting
      </button>
    </div>
  );
}

const btnWithIcon: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7 };
