import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToCall, updateCallStatus, logCallHistory, type CallStatus } from './callService';
import { useWebRTC, type ConnectionState } from './useWebRTC';
import { soundService } from '../../services/soundService';

export function CallScreen() {
  const { callId } = useParams<{ callId: string }>();
  const [searchParams] = useSearchParams();
  const role = (searchParams.get('role') as 'caller' | 'callee') ?? 'callee';
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [callStatus, setCallStatus] = useState<CallStatus>('ringing');
  const [callType, setCallType] = useState<'voice' | 'video'>('video');
  const [otherName, setOtherName] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const hasConnectedOnceRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!callId) return;
    return subscribeToCall(callId, (call) => {
      if (!call) return;
      setCallStatus(call.status);
      setCallType(call.type);
      setOtherName(role === 'caller' ? call.calleeName : call.callerName);
      if (call.status === 'ended' || call.status === 'rejected') {
        navigate(-1);
      }
    });
  }, [callId, role, navigate]);

  // Ringback tone for the caller while the other side hasn't answered yet.
  useEffect(() => {
    const isWaiting = role === 'caller' && callStatus === 'ringing';
    if (isWaiting) {
      soundService.startRingback('outgoing-call');
    } else {
      soundService.stopSound('outgoing-call');
    }
    return () => soundService.stopSound('outgoing-call');
  }, [role, callStatus]);

  const shouldConnect = callStatus === 'accepted';
  const { localStream, mediaError, micOn, cameraOn, toggleMic, toggleCamera, hangUp } = useWebRTC({
    callId: callId ?? '',
    role,
    callType,
    onRemoteStream: setRemoteStream,
    onConnectionStateChange: setConnectionState,
  });

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  // The remote stream's audio track is attached here regardless of call
  // type — a <video> element with a stream that has an audio track already
  // plays that audio, but a voice-only call renders NO video element at
  // all, so without this dedicated <audio> element a voice call would be
  // completely silent (this was the bug: video worked because its <video>
  // tag incidentally carried audio too; voice calls had nothing playing it).
  useEffect(() => {
    if (remoteStream) {
      if (callType === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream, callType]);

  useEffect(() => {
    if (connectionState === 'connected' && !hasConnectedOnceRef.current) {
      hasConnectedOnceRef.current = true;
      soundService.stopSound('outgoing-call');
      soundService.playCallConnected();
    }
  }, [connectionState]);

  async function handleEndCall() {
    soundService.stopSound('outgoing-call');
    hangUp();
    if (callId) {
      await updateCallStatus(callId, 'ended');
      if (profile) {
        await logCallHistory({
          uid: profile.uid,
          otherUid: '',
          otherName,
          type: callType,
          direction: role === 'caller' ? 'outgoing' : 'incoming',
          outcome: connectionState === 'connected' ? 'completed' : 'missed',
          durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
        });
      }
    }
    navigate(-1);
  }

  if (!shouldConnect) {
    return (
      <div style={centeredStyle}>
        <p>{role === 'caller' ? `Calling ${otherName || '…'}` : `Waiting for ${otherName || 'the other person'} to answer…`}</p>
        <button className="rb-btn rb-btn--outline" onClick={handleEndCall}>Cancel</button>
      </div>
    );
  }

  if (mediaError) {
    return (
      <div style={centeredStyle}>
        <p className="rb-error-text">{mediaError}</p>
        <button className="rb-btn rb-btn--outline" onClick={() => navigate(-1)}>Go back</button>
      </div>
    );
  }

  return (
    <div className="rb-call-screen" style={{ height: '100%', background: '#0b0f0e', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Always mounted so voice calls (which render no <video>) still play remote audio. */}
      <audio ref={remoteAudioRef} autoPlay />

      {callType === 'video' ? (
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ color: '#fff', textAlign: 'center' }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              background: 'var(--color-brand-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 700,
              margin: '0 auto 16px',
            }}
          >
            {(otherName || '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ fontSize: 22, marginBottom: 8 }}>{otherName}</div>
          <div style={{ color: 'var(--color-accent)' }}>{connectionState === 'connected' ? 'Connected' : 'Connecting…'}</div>
        </div>
      )}

      {callType === 'video' && (
        <video
          className="rb-call-local-video"
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            bottom: 100,
            right: 20,
            width: 140,
            height: 100,
            objectFit: 'cover',
            borderRadius: 12,
            border: '2px solid rgba(255,255,255,0.3)',
          }}
        />
      )}

      {connectionState !== 'connected' && callType === 'video' && (
        <div style={{ position: 'absolute', top: 20, color: '#fff', background: 'rgba(0,0,0,0.4)', padding: '4px 12px', borderRadius: 999 }}>
          {connectionState === 'failed' ? 'Connection failed — check your network' : 'Connecting…'}
        </div>
      )}

      <div className="rb-call-controls" style={{ position: 'absolute', bottom: 24, display: 'flex', gap: 16 }}>
        <button onClick={toggleMic} style={controlBtnStyle(!micOn)} title={micOn ? 'Mute' : 'Unmute'} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
          {micOn ? <Mic size={19} strokeWidth={1.75} /> : <MicOff size={19} strokeWidth={1.75} />}
        </button>
        {callType === 'video' && (
          <button onClick={toggleCamera} style={controlBtnStyle(!cameraOn)} title={cameraOn ? 'Turn off camera' : 'Turn on camera'} aria-label={cameraOn ? 'Turn off camera' : 'Turn on camera'}>
            {cameraOn ? <VideoIcon size={19} strokeWidth={1.75} /> : <VideoOff size={19} strokeWidth={1.75} />}
          </button>
        )}
        <button onClick={handleEndCall} style={{ ...controlBtnStyle(false), background: 'var(--color-danger)' }} title="End call" aria-label="End call">
          <PhoneOff size={19} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

const centeredStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
};

function controlBtnStyle(muted: boolean): React.CSSProperties {
  return {
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: muted ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.28)',
    color: '#fff',
  };
}
