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

        <section className="rb-card rb-auth-card" aria-labelledby="signup-title">
          <div className="rb-auth-card__brand">
            <BrandMark size={28} />
            <span>{appConfig.name}</span>
          </div>
          <header className="rb-auth-card__heading">
            <h1 id="signup-title">Create your account</h1>
            <p>Start bringing your conversations together.</p>
          </header>

          <form onSubmit={handleSignup} className="rb-auth-form">
            <label className="rb-field-label" htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              className="rb-input"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
            <label className="rb-field-label" htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              className="rb-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <label className="rb-field-label" htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              className="rb-input"
              type="password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {error && <p className="rb-error-text" role="alert">{error}</p>}
            <button className="rb-btn rb-btn--primary" type="submit" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="rb-auth-card__switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
