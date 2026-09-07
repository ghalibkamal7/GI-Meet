import { useEffect, useState } from 'react';
import { isYouTubeConnected, connectYouTubeAccount, startYouTubeLive } from './youtubeLiveService';

interface Props {
  meetingCode: string;
  onClose: () => void;
  onStarted: () => void;
}

type Step = 'form' | 'confirm';

export function GoLiveModal({ meetingCode, onClose, onStarted }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [connected, setConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('unlisted');
  const [connecting, setConnecting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isYouTubeConnected()
      .then(setConnected)
      .finally(() => setCheckingConnection(false));
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const success = await connectYouTubeAccount();
      setConnected(success);
      if (!success) setError('YouTube connection was not completed.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      await startYouTubeLive({ meetingCode, title: title.trim(), description: description.trim(), privacy });
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStep('form');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 380, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        {step === 'form' ? (
          <>
            <h3 style={{ marginBottom: 16 }}>Start YouTube Live</h3>

            <input
              className="rb-input"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <textarea
              className="rb-input"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ marginBottom: 14 }}
            />

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Privacy</div>
              {(['public', 'unlisted', 'private'] as const).map((option) => (
                <label key={option} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 4, textTransform: 'capitalize' }}>
                  <input type="radio" name="privacy" checked={privacy === option} onChange={() => setPrivacy(option)} />
                  {option}
                </label>
              ))}
            </div>

            {error && <p className="rb-error-text" style={{ marginBottom: 10 }}>{error}</p>}

            {!checkingConnection && !connected && (
              <button className="rb-btn rb-btn--outline" style={{ width: '100%', marginBottom: 10 }} onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect YouTube'}
              </button>
            )}

            <button
              className="rb-btn rb-btn--primary"
              style={{ width: '100%' }}
              disabled={!connected || !title.trim()}
              onClick={() => setStep('confirm')}
            >
              Start Live
            </button>
          </>
        ) : (
          <>
            <h3 style={{ marginBottom: 14 }}>Go live?</h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              You're about to stream this meeting to YouTube. Everyone in the meeting should know
              the meeting may become visible to your selected YouTube audience ({privacy}).
              All participants will see a live indicator once streaming starts.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="rb-btn rb-btn--outline" style={{ flex: 1 }} onClick={() => setStep('form')} disabled={starting}>
                Cancel
              </button>
              <button className="rb-btn rb-btn--primary" style={{ flex: 1 }} onClick={handleStart} disabled={starting}>
                {starting ? 'Starting…' : 'Start Live'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 51, 47, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 150,
};
