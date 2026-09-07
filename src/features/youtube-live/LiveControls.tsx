import { useEffect, useState } from 'react';
import { Circle, RefreshCw, AlertTriangle, Copy } from 'lucide-react';
import { stopYouTubeLive, type LiveStreamState } from './youtubeLiveService';

export function LiveControls({ meetingCode, state }: { meetingCode: string; state: LiveStreamState }) {
  const [elapsed, setElapsed] = useState('00:00:00');
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!state.startedAt) return;
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - state.startedAt!) / 1000);
      const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.startedAt]);

  async function handleStop() {
    setStopping(true);
    await stopYouTubeLive(meetingCode).finally(() => setStopping(false));
  }

  const statusMeta: Record<string, { label: string; icon: React.ReactNode }> = {
    connecting: { label: 'Connecting to YouTube…', icon: <RefreshCw size={13} strokeWidth={2} className="rb-spin" /> },
    ready: { label: 'Ready to go live', icon: <Circle size={9} fill="var(--color-accent)" stroke="none" /> },
    live: { label: 'LIVE', icon: <Circle size={9} fill="var(--color-danger)" stroke="none" /> },
    reconnecting: { label: 'Reconnecting…', icon: <RefreshCw size={13} strokeWidth={2} className="rb-spin" /> },
    ended: { label: 'Stream ended', icon: null },
    error: { label: 'Stream error', icon: <AlertTriangle size={13} strokeWidth={2} /> },
  };
  const meta = statusMeta[state.status] ?? { label: state.status, icon: null };

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.65)',
        color: '#fff',
        borderRadius: 12,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        zIndex: 50,
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          {meta.icon}
          {meta.label}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          YouTube Live · {elapsed} · Viewers: {state.viewerCount ?? '--'}
        </div>
        {state.errorMessage && <div style={{ fontSize: 12, color: '#ffb4a3' }}>{state.errorMessage}</div>}
      </div>
      {state.status === 'live' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {state.watchUrl && (
            <button
              className="rb-btn rb-btn--outline"
              style={{ padding: '6px 12px', background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => navigator.clipboard.writeText(state.watchUrl!)}
            >
              <Copy size={13} strokeWidth={1.75} /> Copy watch link
            </button>
          )}
          <button className="rb-btn" style={{ background: 'var(--color-danger)', color: '#fff', padding: '6px 14px' }} onClick={handleStop} disabled={stopping}>
            {stopping ? 'Stopping…' : 'Stop Live'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Persistent banner shown to every participant while the stream is active. */
export function LiveIndicatorBanner() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        background: 'var(--color-danger)',
        color: '#fff',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        padding: '6px 0',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Circle size={8} fill="#fff" stroke="none" /> This meeting is live on YouTube
    </div>
  );
}
