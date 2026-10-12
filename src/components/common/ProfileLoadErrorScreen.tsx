import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/firebaseConfig';
import type { ProfileLoadError } from '../../services/profileState';

const COPY = {
  permission: {
    title: "We can't read your profile",
    body: 'The database refused the request, so GI Meet cannot tell whether your profile exists. Your account and data have not been changed. This is a configuration problem (Firestore security rules) — trying again will only help once it is fixed.',
  },
  network: {
    title: 'Connection problem',
    body: 'GI Meet could not reach the database. Check your internet connection and try again. Your account and data have not been changed.',
  },
  unknown: {
    title: 'Could not load your profile',
    body: 'Something went wrong while loading your profile. Your account and data have not been changed. Please try again.',
  },
} as const;

export function ProfileLoadErrorScreen({ error, onRetry }: { error: ProfileLoadError; onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const copy = COPY[error.kind];

  async function handleRetry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="rb-card" role="alert" style={{ width: '100%', maxWidth: 440, padding: 28 }}>
        <h1 style={{ fontSize: 22, marginBottom: 10 }}>{copy.title}</h1>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>{copy.body}</p>
        <p style={{ margin: '0 0 20px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
          Error code: {error.code}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="rb-btn rb-btn--primary" onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Trying again…' : 'Try again'}
          </button>
          <button type="button" className="rb-btn rb-btn--outline" onClick={() => void signOut(auth)} disabled={retrying}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}