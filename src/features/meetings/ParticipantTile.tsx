import { useEffect, useRef, useState } from 'react';
import { Track, ConnectionQuality, type LocalParticipant, type RemoteParticipant } from 'livekit-client';
import { Hand } from 'lucide-react';

const QUALITY_COLOR: Record<ConnectionQuality, string> = {
  [ConnectionQuality.Excellent]: 'var(--color-success)',
  [ConnectionQuality.Good]: 'var(--color-success)',
  [ConnectionQuality.Poor]: 'var(--color-accent)',
  [ConnectionQuality.Lost]: 'var(--color-danger)',
  [ConnectionQuality.Unknown]: 'transparent',
};

export function ParticipantTile({
  participant,
  isLocal,
  handRaised,
}: {
  participant: LocalParticipant | RemoteParticipant;
  isLocal: boolean;
  handRaised?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [quality, setQuality] = useState<ConnectionQuality>(participant.connectionQuality);

  useEffect(() => {
    const videoPub = participant.getTrackPublication(Track.Source.Camera) ?? participant.getTrackPublication(Track.Source.ScreenShare);
    const audioPub = participant.getTrackPublication(Track.Source.Microphone);

    if (videoPub?.track && videoRef.current) {
      videoPub.track.attach(videoRef.current);
    }
    if (audioPub?.track && audioRef.current && !isLocal) {
      audioPub.track.attach(audioRef.current);
    }

    return () => {
      videoPub?.track?.detach();
      audioPub?.track?.detach();
    };
  }, [participant, isLocal]);

  useEffect(() => {
    const interval = setInterval(() => setQuality(participant.connectionQuality), 3000);
    return () => clearInterval(interval);
  }, [participant]);

  const hasVideo = Boolean(
    participant.getTrackPublication(Track.Source.Camera)?.isSubscribed ||
      participant.getTrackPublication(Track.Source.ScreenShare)?.isSubscribed
  );

  return (
    <div
      style={{
        position: 'relative',
        background: '#1a201d',
        borderRadius: 12,
        overflow: 'hidden',
        aspectRatio: '16 / 9',
        border: participant.isSpeaking ? '2px solid var(--color-accent)' : '2px solid transparent',
      }}
    >
      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700 }}>
          {(participant.name || participant.identity).charAt(0).toUpperCase()}
        </div>
      )}
      <audio ref={audioRef} autoPlay />

      {handRaised && (
        <div style={{ position: 'absolute', top: 6, right: 8, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: 5, display: 'flex' }}>
          <Hand size={14} strokeWidth={2} color="var(--color-accent)" />
        </div>
      )}

      <div
        title={`Connection: ${quality}`}
        style={{ position: 'absolute', top: 8, left: 8, width: 8, height: 8, borderRadius: '50%', background: QUALITY_COLOR[quality] }}
      />

      <div style={{ position: 'absolute', bottom: 6, left: 8, color: '#fff', fontSize: 12, background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 999 }}>
        {participant.name || participant.identity} {isLocal && '(You)'}
      </div>
    </div>
  );
}
