import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rb-card" style={{ padding: '16px 18px', marginBottom: 14 }}>
      <h2 style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        {title}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--color-text)' }}>{children}</div>
    </section>
  );
}

const listStyle = { margin: '6px 0 0', paddingLeft: 20 } as const;
const iconProps = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

export function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="rb-page rb-page--narrow rb-privacy-page">
      <button
        type="button"
        onClick={() => navigate('/settings')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          fontSize: 14,
          padding: '8px 0',
          marginBottom: 4,
        }}
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Settings
      </button>

      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Privacy &amp; encryption</h1>
      <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
        GI Meet is built so that what you write in a private chat can only be read by you and the people you are talking to.
      </p>

      <Section icon={<Lock {...iconProps} />} title="What is end-to-end encrypted">
        <ul style={listStyle}>
          <li>Text messages in one-to-one chats and groups, including edits and the quoted text in replies.</li>
          <li>Photos, videos, files and voice messages you send in chats and groups.</li>
        </ul>
        <p style={{ margin: '10px 0 0' }}>
          They are encrypted on your device before they are sent. Our servers only ever store unreadable, scrambled data, so
          neither GI Meet nor Firebase can read them.
        </p>
      </Section>

      <Section icon={<KeyRound {...iconProps} />} title="How it works">
        <ul style={listStyle}>
          <li>
            Each device creates its own pair of encryption keys. The private key stays on your device: in your browser&apos;s
            site storage on the web and installed app, and in the iOS Keychain or Android Keystore in the mobile apps. Only
            the public key is saved to your profile.
          </li>
          <li>
            In a one-to-one chat, your device and your contact&apos;s device each work out the same secret key from the two
            key pairs and use it (AES-256-GCM) to lock and unlock messages. That secret key is never sent anywhere.
          </li>
          <li>
            In a group, a shared group key (AES-256-GCM) is used. It is stored only in locked form, separately for each
            member, so only members&apos; devices can open it.
          </li>
        </ul>
        <p style={{ margin: '10px 0 0' }}>
          A lock icon next to a chat or group name shows that the conversation is encrypted.
        </p>
      </Section>

      <Section icon={<EyeOff {...iconProps} />} title="What is not hidden">
        <ul style={listStyle}>
          <li>Who you talk to, when messages are sent, and how many.</li>
          <li>The names, types and sizes of files you share.</li>
          <li>
            Your profile (name, username, bio, photo and online status), plus group names, descriptions, member lists,
            announcements and polls.
          </li>
          <li>Meetings, meeting chat and Q&amp;A, and Spot stories.</li>
          <li>
            Messages to someone who has not set up their encryption key yet. They are sent without end-to-end encryption
            until that person opens GI Meet and a key is created.
          </li>
        </ul>
      </Section>

      <Section icon={<ShieldCheck {...iconProps} />} title="Previews in your chat list">
        <p style={{ margin: 0 }}>
          Chat-list previews of encrypted messages are decrypted on your device only. If a preview cannot be decrypted, for
          example because the key is not available on this device, you will see a plain &ldquo;Message&rdquo; instead.
        </p>
      </Section>

      <Section icon={<KeyRound {...iconProps} />} title="Using more than one device">
        <p style={{ margin: 0 }}>
          Encryption keys belong to a single device. Signing in on a new device creates a new key pair, and older encrypted
          messages may not be readable there. Clearing your browser&apos;s site data or uninstalling the app can remove the
          key from that device.
        </p>
      </Section>
    </div>
  );
}