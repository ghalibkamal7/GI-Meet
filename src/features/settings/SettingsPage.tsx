import { useState } from 'react';
import { UserCircle, Shield, Bell, Palette, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { updateProfileFields, updatePrivacySettings } from '../../services/userService';
import { requestNotificationPermission } from '../notifications/notificationService';
import { appConfig } from '../../config/appConfig';
import { PrivacySettingsLink } from './PrivacySettingsLink';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';

type Tab = 'account' | 'privacy' | 'notifications' | 'appearance' | 'security';

export function SettingsPage() {
  const { profile, refreshProfile, logOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const [tab, setTab] = useState<Tab>('account');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [showLastSeen, setShowLastSeen] = useState(profile?.privacy?.showLastSeen ?? true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(profile?.privacy?.showOnlineStatus ?? true);

  if (!profile) return null;

  async function handleSaveAccount() {
    setSaving(true);
    await updateProfileFields(profile!.uid, { displayName, bio });
    await refreshProfile();
    setSaving(false);
  }

  async function handleSavePrivacy() {
    await updatePrivacySettings(profile!.uid, { showLastSeen, showOnlineStatus });
    await refreshProfile();
  }

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission(profile!.uid);
    setNotifStatus(
      result === 'granted'
        ? 'Notifications enabled.'
        : result === 'unsupported'
        ? 'Push notifications are not supported in this browser.'
        : 'Notification permission was denied.'
    );
  }

  const TABS: { id: Tab; label: string; Icon: typeof UserCircle }[] = [
    { id: 'account', label: 'Account', Icon: UserCircle },
    { id: 'privacy', label: 'Privacy', Icon: Shield },
    { id: 'notifications', label: 'Notifications', Icon: Bell },
    { id: 'appearance', label: 'Appearance', Icon: Palette },
    { id: 'security', label: 'Security', Icon: Lock },
  ];

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 190, borderRight: '1px solid var(--color-border)', padding: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              padding: '9px 10px',
              borderRadius: 8,
              border: 'none',
              marginBottom: 2,
              background: tab === t.id ? 'var(--color-brand-100)' : 'transparent',
              color: tab === t.id ? 'var(--color-brand-700)' : 'var(--color-text)',
              fontWeight: tab === t.id ? 600 : 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <t.Icon size={16} strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: 28, maxWidth: 480 }}>
        {tab === 'account' && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Account</h2>
            <div style={{ marginBottom: 20 }}>
              <ProfilePhotoEditor />
            </div>
            <label style={fieldLabel}>Display name</label>
            <input className="rb-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={{ marginBottom: 14 }} />
            <label style={fieldLabel}>Username</label>
            <input className="rb-input" value={`@${profile.username}`} disabled style={{ marginBottom: 14, opacity: 0.6 }} />
            <label style={fieldLabel}>Bio</label>
            <textarea className="rb-input" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={160} style={{ marginBottom: 16 }} />
            <button className="rb-btn rb-btn--primary" onClick={handleSaveAccount} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        )}

        {tab === 'privacy' && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Privacy</h2>
            <div style={{ marginBottom: 20 }}>
              <PrivacySettingsLink />
            </div>
            <label style={toggleRow}>
              <input type="checkbox" checked={showLastSeen} onChange={(e) => setShowLastSeen(e.target.checked)} />
              Show my last seen time to others
            </label>
            <label style={toggleRow}>
              <input type="checkbox" checked={showOnlineStatus} onChange={(e) => setShowOnlineStatus(e.target.checked)} />
              Show my online status to others
            </label>
            <button className="rb-btn rb-btn--primary" style={{ marginTop: 12 }} onClick={handleSavePrivacy}>
              Save changes
            </button>
          </>
        )}

        {tab === 'notifications' && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Notifications</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
              Get notified about new messages, calls, and meeting invites even when {appConfig.name} isn't open.
            </p>
            <button className="rb-btn rb-btn--primary" onClick={handleEnableNotifications}>
              Enable push notifications
            </button>
            {notifStatus && <p style={{ marginTop: 10, fontSize: 13, color: 'var(--color-text-muted)' }}>{notifStatus}</p>}
          </>
        )}

        {tab === 'appearance' && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Appearance</h2>
            {(['light', 'dark', 'system'] as const).map((option) => (
              <label key={option} style={toggleRow}>
                <input type="radio" name="theme" checked={preference === option} onChange={() => setPreference(option)} />
                <span style={{ textTransform: 'capitalize' }}>{option}</span>
              </label>
            ))}
          </>
        )}

        {tab === 'security' && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Security</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
              Signed in as {profile.email}
            </p>
            <button className="rb-btn rb-btn--outline" onClick={() => logOut()}>Log out</button>
          </>
        )}
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' };
const toggleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 12 };
