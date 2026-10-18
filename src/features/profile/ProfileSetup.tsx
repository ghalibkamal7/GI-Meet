import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createUserProfile, getUsernameOwner } from '../../services/userService';
import { isValidUsername, normalizeUsername } from '../../utils/validators';
import { classifyError } from '../../services/profileState';
import { ensureDeviceKeys } from '../chat/e2ee';
import { consumeRedirectTarget } from '../../utils/redirectAfterLogin';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ProfileLoadErrorScreen } from '../../components/common/ProfileLoadErrorScreen';

function describeSetupError(error: unknown): string {
  if (error instanceof Error && error.message === 'username-taken') {
    return 'That username was just taken. Try another one.';
  }
  const failure = classifyError(error);
  if (failure.kind === 'permission') {
    return `Your profile could not be saved because the database rejected the request (${failure.code}). This is a configuration problem, not something you did wrong.`;
  }
  if (failure.kind === 'network') {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return `Something went wrong creating your profile (${failure.code}). Please try again.`;
}

export function ProfileSetup() {
  const { firebaseUser, loading, needsProfileSetup, profileError, retryProfileLoad, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // All hooks are declared above; the guards below only decide WHAT to render.
  if (loading) return <LoadingSpinner label="Getting things ready…" />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (profileError) return <ProfileLoadErrorScreen error={profileError} onRetry={retryProfileLoad} />;
  // A signed-in user who already has a profile must never see this form, however they got here.
  if (!needsProfileSetup) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const check = isValidUsername(username);
    if (!check.valid) {
      setError(check.message ?? 'Invalid username.');
      return;
    }

    setSubmitting(true);
    try {
      const normalized = normalizeUsername(username);

      // "Taken" means owned by SOMEONE ELSE — a reservation left behind by this same account is fine to reuse.
      const owner = await getUsernameOwner(normalized);
      if (owner && owner !== firebaseUser!.uid) {
        setError('That username is already taken. Try another one.');
        return;
      }

      await createUserProfile({
        uid: firebaseUser!.uid,
        email: firebaseUser!.email ?? '',
        displayName: firebaseUser!.displayName ?? normalized,
        username: normalized,
        photoURL: firebaseUser!.photoURL,
        bio,
      });

      try {
        await ensureDeviceKeys(firebaseUser!.uid);
      } catch {
        // Non-fatal — chats fall back to plaintext until a key exists.
      }

      // Re-reads users/{uid}; only after it is CONFIRMED does needsProfileSetup become false.
      await refreshProfile();
      navigate(consumeRedirectTarget() ?? '/', { replace: true });
    } catch (caught) {
      setError(describeSetupError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rb-auth-screen" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'radial-gradient(ellipse at top, var(--color-brand-100) 0%, var(--color-bg) 55%)' }}>
      <div className="rb-card rb-auth-card" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Set up your profile</h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 24 }}>Pick a username people can find you by.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <input
              className="rb-input"
              type="text"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
              3-20 characters: lowercase letters, numbers, underscores.
            </p>
          </div>
          <textarea
            className="rb-input"
            placeholder="Short bio (optional)"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={160}
          />
          {error && (
            <p className="rb-error-text" role="alert">
              {error}
            </p>
          )}
          <button className="rb-btn rb-btn--primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}