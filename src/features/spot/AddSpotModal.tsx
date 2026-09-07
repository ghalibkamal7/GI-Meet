import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createSpot } from './spotService';

const QUICK_EMOJIS = ['😀', '🔥', '❤️', '🎉', '😢', '👍'];

export function AddSpotModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  }

  async function handlePost() {
    if (!profile || (!text.trim() && !file)) return;
    setPosting(true);
    await createSpot({
      uid: profile.uid,
      authorName: profile.displayName,
      authorPhoto: profile.photoURL,
      text,
      emoji,
      mediaFile: file ?? undefined,
    });
    setPosting(false);
    onClose();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 360, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 14 }}>Add Spot</h3>

        {previewUrl ? (
          file?.type.startsWith('video/') ? (
            <video src={previewUrl} controls style={{ width: '100%', borderRadius: 12, marginBottom: 12, maxHeight: 300 }} />
          ) : (
            <img src={previewUrl} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 12, maxHeight: 300, objectFit: 'cover' }} />
          )
        ) : (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 140,
              border: '2px dashed var(--color-border)',
              borderRadius: 12,
              marginBottom: 12,
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              fontSize: 14,
            }}
          >
            Tap to add a photo or video
            <input type="file" accept="image/*,video/*" hidden onChange={handleFilePicked} />
          </label>
        )}

        <textarea className="rb-input" placeholder="Say something..." value={text} onChange={(e) => setText(e.target.value)} rows={2} style={{ marginBottom: 10 }} />

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(emoji === e ? null : e)}
              style={{
                fontSize: 20,
                background: emoji === e ? 'var(--color-brand-100)' : 'none',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                padding: 4,
              }}
            >
              {e}
            </button>
          ))}
        </div>

        <button className="rb-btn rb-btn--primary" style={{ width: '100%' }} onClick={handlePost} disabled={posting || (!text.trim() && !file)}>
          {posting ? 'Posting…' : 'Post Spot'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8, textAlign: 'center' }}>
          Visible to your chats and group contacts for 24 hours.
        </p>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 51, 47, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 150,
};
