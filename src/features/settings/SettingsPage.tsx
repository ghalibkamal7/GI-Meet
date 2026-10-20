import { useState } from 'react';
import { UserCircle, Shield, Bell, Palette, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { updateProfileFields, updatePrivacySettings } from '../../services/userService';
import { requestNotificationPermission } from '../notifications/notificationService';
import { appConfig } from '../../config/appConfig';
import { PrivacySettingsLink } from './PrivacySettingsLink';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';
import { ensureDeviceKeys, DeviceEncryptionKeyError, DeviceEncryptionKeyStorageError } from '../chat/e2ee';
import {
  createEncryptedDeviceKeyTransfer,
  importEncryptedDeviceKeyTransfer,
  privateKeyMatchesRegisteredPublicKey,
} from '../chat/deviceKeyTransfer';
import { getPrivateKey, savePrivateKey, savePrivateKeyIfAbsent } from '../../services/secureKeyStore';
import { getUserProfile } from '../../services/userService';

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
  const [transferPayload, setTransferPayload] = useState('');
  const [transferPassphrase, setTransferPassphrase] = useState('');
  const [importPayload, setImportPayload] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [replaceMismatchedKey, setReplaceMismatchedKey] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);

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

  async function handleCreateKeyTransfer() {
    setTransferBusy(true);
    setTransferStatus(null);
    setTransferPayload('');
    setTransferPassphrase('');
    try {
      const privateKey = await ensureDeviceKeys(profile!.uid);
      const transfer = await createEncryptedDeviceKeyTransfer(privateKey);
      setTransferPayload(transfer.payload);
      setTransferPassphrase(transfer.passphrase);
      setTransferStatus('Transfer created. Move the encrypted text and passphrase to your other device separately.');
    } catch (error) {
      setTransferStatus(
        error instanceof DeviceEncryptionKeyError || error instanceof DeviceEncryptionKeyStorageError
          ? error.message
          : 'Could not create a key transfer. Check this device’s storage and connection, then retry.'
      );
    } finally {
      setTransferBusy(false);
    }
  }

  async function handleImportKeyTransfer() {
    if (!importPayload.trim() || !importPassphrase.trim()) {
      setTransferStatus('Enter both the encrypted transfer text and its passphrase.');
      return;
    }
    setTransferBusy(true);
    setTransferStatus(null);
    try {
      const currentProfile = await getUserProfile(profile!.uid);
      const registeredPublicKey = currentProfile?.publicKeyJwk;
      if (typeof registeredPublicKey !== 'string' || !registeredPublicKey.trim()) {
        setTransferStatus('This account has no registered encryption key to enroll. Create the key on the original device first.');
        return;
      }

      const importedKey = await importEncryptedDeviceKeyTransfer(
        importPayload.trim(),
        importPassphrase.trim(),
        registeredPublicKey
      );
      const currentKey = await getPrivateKey(profile!.uid);
      if (currentKey) {
        if (await privateKeyMatchesRegisteredPublicKey(currentKey, registeredPublicKey)) {
          setTransferStatus('This device already has the registered encryption key. Nothing was changed.');
          return;
        }
        if (!replaceMismatchedKey) {
          setTransferStatus('A different local key exists. Review the replacement warning below and explicitly confirm before retrying.');
          return;
        }
        await savePrivateKey(profile!.uid, importedKey);
      } else {
        const storedKey = await savePrivateKeyIfAbsent(profile!.uid, importedKey);
        if (!await privateKeyMatchesRegisteredPublicKey(storedKey, registeredPublicKey)) {
          setTransferStatus('Another key was saved concurrently. No key was replaced; refresh and inspect this device before retrying.');
          return;
        }
      }

      setImportPayload('');
      setImportPassphrase('');
      setReplaceMismatchedKey(false);
      setTransferStatus('This device is enrolled. Your account’s registered public key and message format were not changed.');
    } catch (error) {
      if (error instanceof DeviceEncryptionKeyError || error instanceof DeviceEncryptionKeyStorageError) {
        setTransferStatus(error.message);
      } else if (error instanceof Error && error.message.includes('transfer')) {
        setTransferStatus(error.message);
      } else {
        setTransferStatus('Could not access key storage or account settings. No registered public key was changed; retry when online.');
      }
    } finally {
      setTransferBusy(false);
    }
  }

  async function copyTransferValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setTransferStatus(`${label} copied. Share it only through a private channel.`);
    } catch {
      setTransferStatus(
        label === 'Passphrase'
          ? 'Clipboard access failed. The passphrase was not displayed or copied; allow clipboard access and retry.'
          : `Clipboard access failed. Select and copy the ${label.toLowerCase()} manually.`
      );
    }
  }

  const TABS: { id: Tab; label: string; Icon: typeof UserCircle }[] = [
    { id: 'account', label: 'Account', Icon: UserCircle },
    { id: 'privacy', label: 'Privacy', Icon: Shield },
    { id: 'notifications', label: 'Notifications', Icon: Bell },
    { id: 'appearance', label: 'Appearance', Icon: Palette },
    { id: 'security', label: 'Security', Icon: Lock },
  ];

  return (
    <div className="rb-settings-layout">
      <div className="rb-settings-nav" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`settings-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="settings-panel"
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
              color: tab === t.id ? 'var(--color-brand-600)' : 'var(--color-text)',
              fontWeight: tab === t.id ? 600 : 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <t.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="rb-settings-panel" role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${tab}`}>
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
            <section aria-labelledby="e2ee-device-transfer-title" style={{ marginBottom: 24 }}>
              <h3 id="e2ee-device-transfer-title" style={{ fontSize: 16, marginBottom: 8 }}>Encrypted chat on another device</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                GI Meet keeps your account encryption key on your devices. On a device that already decrypts your chats,
                create a transfer, then enter both values on the new device while signed into this same account.
                The transfer is encrypted on this device and is not uploaded to GI Meet.
              </p>
              <button className="rb-btn rb-btn--outline" onClick={handleCreateKeyTransfer} disabled={transferBusy}>
                {transferBusy ? 'Working…' : 'Create encrypted key transfer'}
              </button>
              {transferPayload && (
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  <label style={fieldLabel} htmlFor="e2ee-transfer-payload">Encrypted transfer text</label>
                  <textarea
                    id="e2ee-transfer-payload"
                    className="rb-input"
                    value={transferPayload}
                    readOnly
                    rows={4}
                    style={{ fontFamily: 'monospace', fontSize: 12, overflowWrap: 'anywhere' }}
                  />
                  <button className="rb-btn rb-btn--outline" onClick={() => copyTransferValue(transferPayload, 'Encrypted transfer text')}>
                    Copy encrypted text
                  </button>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                    The passphrase is not displayed. Copy it directly to your clipboard, then paste it on the other device.
                  </p>
                  <button
                    className="rb-btn rb-btn--outline"
                    onClick={() => copyTransferValue(transferPassphrase, 'Passphrase')}
                    aria-label="Copy transfer passphrase"
                  >
                    Copy passphrase
                  </button>
                  <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>
                    Keep both values private and transfer them separately. Anyone who obtains both can access encrypted messages for this account.
                  </p>
                  <button
                    className="rb-btn rb-btn--outline"
                    onClick={() => {
                      setTransferPayload('');
                      setTransferPassphrase('');
                      setTransferStatus('The transfer values were cleared from this page.');
                    }}
                  >
                    Clear transfer values
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
                <label style={fieldLabel} htmlFor="e2ee-import-payload">Import encrypted transfer text</label>
                <textarea
                  id="e2ee-import-payload"
                  className="rb-input"
                  value={importPayload}
                  onChange={(event) => setImportPayload(event.target.value)}
                  rows={4}
                  autoComplete="off"
                />
                <label style={fieldLabel} htmlFor="e2ee-import-passphrase">Transfer passphrase</label>
                <input
                  id="e2ee-import-passphrase"
                  className="rb-input"
                  value={importPassphrase}
                  onChange={(event) => setImportPassphrase(event.target.value)}
                  autoComplete="off"
                />
                <label style={{ ...toggleRow, alignItems: 'flex-start', color: 'var(--color-danger)' }}>
                  <input
                    type="checkbox"
                    checked={replaceMismatchedKey}
                    onChange={(event) => setReplaceMismatchedKey(event.target.checked)}
                  />
                  Replace a mismatched local key only after verifying that the imported key matches this account’s registered public key. Some messages encrypted to the old local key may remain unavailable.
                </label>
                <button className="rb-btn rb-btn--primary" onClick={handleImportKeyTransfer} disabled={transferBusy}>
                  {transferBusy ? 'Working…' : 'Import and enroll this device'}
                </button>
              </div>
              {transferStatus && <p role="status" style={{ marginTop: 12, color: 'var(--color-text-muted)', fontSize: 13 }}>{transferStatus}</p>}
            </section>
            <button className="rb-btn rb-btn--outline" onClick={() => logOut()}>Log out</button>
          </>
        )}
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' };
const toggleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 12 };
