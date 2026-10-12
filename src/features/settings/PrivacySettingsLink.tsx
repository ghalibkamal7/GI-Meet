import { useNavigate } from 'react-router-dom';
import { ChevronRight, ShieldCheck } from 'lucide-react';

/** A tappable row for the Settings screen that opens /settings/privacy. */
export function PrivacySettingsLink() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="rb-card"
      onClick={() => navigate('/settings/privacy')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '14px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        background: 'var(--color-surface)',
      }}
    >
      <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--color-brand-600)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: 15 }}>Privacy &amp; encryption</strong>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>How your messages are protected</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
    </button>
  );
}