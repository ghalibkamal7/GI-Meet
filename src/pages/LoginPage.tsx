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
    <main className="rb-auth-screen">
      <div className="rb-auth-layout">
        <aside className="rb-auth-story" aria-labelledby="auth-story-title">
          <div className="rb-auth-story__brand">
            <BrandMark size={34} />
            <span>{appConfig.name}</span>
          </div>
          <div className="rb-auth-story__message">
            <span className="rb-eyebrow">A better place to connect</span>
            <h2 id="auth-story-title">Make room for good conversation.</h2>
            <p>Bring your messages, calls and meetings together in one thoughtful space.</p>
          </div>
          <div className="rb-auth-story__note">
            <span className="rb-auth-story__status" aria-hidden="true" />
            <p>End-to-end encryption for private chats, with device controls that stay in your hands.</p>
          </div>
        </aside>

        <section className="rb-card rb-auth-card" aria-labelledby="login-title">
          <div className="rb-auth-card__brand">
            <BrandMark size={28} />
            <span>{appConfig.name}</span>
          </div>
          <header className="rb-auth-card__heading">
            <h1 id="login-title">Welcome back</h1>
            <p>Sign in to continue to your conversations.</p>
          </header>

          <form onSubmit={handleEmailLogin} className="rb-auth-form">
            <label className="rb-field-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="rb-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <label className="rb-field-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="rb-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error && <p className="rb-error-text" role="alert">{error}</p>}
            <button className="rb-btn rb-btn--primary" type="submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <div className="rb-auth-divider">
            <span>or continue with</span>
          </div>

          <button
            type="button"
            className="rb-btn rb-btn--outline rb-auth-google"
            onClick={handleGoogleLogin}
            disabled={submitting}
          >
            <span>
              <GoogleLogo size={17} /> Continue with Google
            </span>
          </button>

          <p className="rb-auth-card__switch">
            New to GI Meet? <Link to="/signup">Create an account</Link>
          </p>
          <p className="rb-auth-card__help">
            Need help? <a href="mailto:ghalibkamal8@gmail.com">Contact us</a>
          </p>
        </section>
      </div>
    </main>
  );
}