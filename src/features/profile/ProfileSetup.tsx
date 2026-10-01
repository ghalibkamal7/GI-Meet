import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createUserProfile, isUsernameTaken } from '../../services/userService';
import { isValidUsername, normalizeUsername } from '../../utils/validators';
import { ensureDeviceKeys } from '../chat/e2ee';
import { consumeRedirectTarget } from '../../utils/redirectAfterLogin';

export function ProfileSetup() {
  const { firebaseUser, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!firebaseUser) {
    navigate('/login');
    return null;
  }

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
      const taken = await isUsernameTaken(normalized);
      if (taken) {
        setError('That username is already taken. Try another one.');
        setSubmitting(false);
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
        // Non-fatal — chats will fall back to plaintext until a key exists.
      }

      await refreshProfile();
      navigate(consumeRedirectTarget() ?? '/');
    } catch (err) {
      if (err instanceof Error && err.message === 'username-taken') {
        setError('That username was just taken. Try another one.');
      } else {
        setError('Something went wrong creating your profile. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="rb-card" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Set up your profile</h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 24 }}>
          Pick a username people can find you by.
        </p>

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
          {error && <p className="rb-error-text">{error}</p>}
          <button className="rb-btn rb-btn--primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}