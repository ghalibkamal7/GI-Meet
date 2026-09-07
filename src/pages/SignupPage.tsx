import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUpWithEmail, getAuthErrorMessage } from '../firebase/auth';
import { isValidEmail, isValidPassword } from '../utils/validators';
import { appConfig } from '../config/appConfig';
import { BrandMark } from '../components/common/BrandMark';

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    const passwordCheck = isValidPassword(password);
    if (!passwordCheck.valid) {
      setError(passwordCheck.message ?? 'Invalid password.');
      return;
    }
    if (name.trim().length < 2) {
      setError('Please enter your name.');
      return;
    }

    setSubmitting(true);
    try {
      await signUpWithEmail(email.trim(), password, name.trim());
      // AuthContext will detect there's no Firestore profile yet and route
      // to /setup-profile via ProtectedRoute's needsProfileSetup check.
      navigate('/setup-profile');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background:
          'radial-gradient(ellipse at top, var(--color-brand-100) 0%, var(--color-bg) 55%)',
      }}
    >
      <div className="rb-card" style={{ width: '100%', maxWidth: 400, padding: 32, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <BrandMark size={40} />
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 4, textAlign: 'center' }}>Join {appConfig.name}</h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 28, textAlign: 'center', fontSize: 14 }}>
          {appConfig.shortDescription}
        </p>

        <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="rb-input"
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
          <input
            className="rb-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className="rb-input"
            type="password"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          {error && <p className="rb-error-text">{error}</p>}
          <button className="rb-btn rb-btn--primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 14, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--color-brand-600)', fontWeight: 600 }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
