import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { markSpotViewed, reactToSpot, deleteSpot } from './spotService';
import { getOrCreateDirectChat, sendMessage } from '../chat/chatService';
import type { Spot } from './spotTypes';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

const SLIDE_DURATION_MS = 5000;
const REACT_EMOJIS = ['😀', '🔥', '❤️', '😢', '👏'];

export function SpotViewer({ spots, startIndex, onClose }: { spots: Spot[]; startIndex: number; onClose: () => void }) {
  const { profile } = useAuth();
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const spot = spots[index];

  useEffect(() => {
    if (!spot || !profile) return;
    markSpotViewed(spot.id, profile.uid);
    setProgress(0);
    const start = Date.now();
    const interval = setInterval(() => {
      const pct = ((Date.now() - start) / SLIDE_DURATION_MS) * 100;
      if (pct >= 100) {
        handleNext();
      } else {
        setProgress(pct);
      }
    }, 100);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, spot]);

  function handleNext() {
    if (index < spots.length - 1) setIndex(index + 1);
    else onClose();
  }

  function handlePrev() {
    if (index > 0) setIndex(index - 1);
  }

  async function handleReply() {
    if (!profile || !replyText.trim() || !spot) return;
    const chatId = await getOrCreateDirectChat(
      profile.uid,
      { displayName: profile.displayName, photoURL: profile.photoURL },
      spot.uid,
      { displayName: spot.authorName, photoURL: spot.authorPhoto }
    );
    await sendMessage({ chatId, senderId: profile.uid, text: `Re your Spot: ${replyText}` });
    setReplyText('');
  }

  if (!spot || !profile) return null;
  const isOwn = spot.uid === profile.uid;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 300, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px' }}>
        {spots.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${i < index ? 100 : i === index ? progress : 0}%`, background: '#fff' }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 10px', color: '#fff' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-brand-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, overflow: 'hidden' }}>
          {spot.authorPhoto ? <img src={spot.authorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : spot.authorName.charAt(0)}
        </div>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{spot.authorName}</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{new Date(spot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }} aria-label="Close"><X size={22} strokeWidth={1.75} /></button>
      </div>

      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div onClick={handlePrev} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', cursor: 'pointer' }} />
        <div onClick={handleNext} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '30%', cursor: 'pointer' }} />

        {spot.mediaType === 'image' && <img src={spot.mediaUrl!} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
        {spot.mediaType === 'video' && <video src={spot.mediaUrl!} autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />}
        {spot.mediaType === 'none' && (
          <div style={{ padding: 32, textAlign: 'center' }}>
            {spot.emoji && <div style={{ fontSize: 48, marginBottom: 12 }}>{spot.emoji}</div>}
            <p style={{ color: '#fff', fontSize: 22, fontWeight: 600 }}>{spot.text}</p>
          </div>
        )}
        {spot.mediaType !== 'none' && spot.text && (
          <p style={{ position: 'absolute', bottom: 20, color: '#fff', fontSize: 16, textAlign: 'center', padding: '0 20px' }}>{spot.text}</p>
        )}
      </div>

      {isOwn ? (
        <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{spot.viewedBy.length} view{spot.viewedBy.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setConfirmingDelete(true)} style={{ background: 'none', border: 'none', color: '#ff8a75', cursor: 'pointer', fontSize: 13 }}>
            Delete
          </button>
        </div>
      ) : (
        <div style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {REACT_EMOJIS.map((e) => (
              <button key={e} onClick={() => reactToSpot(spot.id, profile.uid, e)} style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>
                {e}
              </button>
            ))}
          </div>
          <input
            className="rb-input"
            placeholder="Reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReply()}
            style={{ flex: 1 }}
          />
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this Spot?"
          message="This will remove it for everyone who could see it."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteSpot(spot.id);
            onClose();
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
