import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmail, signInWithGoogle, getAuthErrorMessage } from '../firebase/auth';
import { appConfig } from '../config/appConfig';
import { BrandMark } from '../components/common/BrandMark';
import { GoogleLogo } from '../components/common/GoogleLogo';
import { consumeRedirectTarget } from '../utils/redirectAfterLogin';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      navigate(consumeRedirectTarget() ?? '/');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      navigate(consumeRedirectTarget() ?? '/');
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
        <h1 style={{ fontSize: 26, marginBottom: 4, textAlign: 'center' }}>{appConfig.name}</h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 28, textAlign: 'center', fontSize: 14 }}>
          {appConfig.tagline}
        </p>

        <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <p className="rb-error-text">{error}</p>}
          <button className="rb-btn rb-btn--primary" type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>

        <button
          className="rb-btn rb-btn--outline"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          onClick={handleGoogleLogin}
          disabled={submitting}
        >
          <GoogleLogo size={17} /> Continue with Google
        </button>

        <p style={{ marginTop: 24, fontSize: 14, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          New here? <Link to="/signup" style={{ color: 'var(--color-brand-600)', fontWeight: 600 }}>Create an account</Link>
        </p>
        <p style={{ marginTop: 10, fontSize: 13, textAlign: 'center', color: 'var(--color-text-muted)' }}>
  Need help?{' '}
  <a href="mailto:ghalibkamal8@gmail.com" style={{ color: 'var(--color-brand-600)', fontWeight: 600 }}>
    Contact Us
  </a>
</p>
      </div>
    </div>
  );
}