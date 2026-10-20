import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToMySpots, subscribeToSpotFeed } from './spotService';
import type { Spot } from './spotTypes';
import { AddSpotModal } from './AddSpotModal';
import { SpotViewer } from './SpotViewer';

export function SpotPage() {
  const { profile } = useAuth();
  const [mySpots, setMySpots] = useState<Spot[]>([]);
  const [contactSpots, setContactSpots] = useState<Record<string, Spot[]>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState<{ spots: Spot[]; startIndex: number } | null>(null);

  useEffect(() => {
    if (!profile) return;
    const unsub1 = subscribeToMySpots(profile.uid, setMySpots);
    const unsub2 = subscribeToSpotFeed(profile.uid, setContactSpots);
    return () => {
      unsub1();
      unsub2();
    };
  }, [profile]);

  if (!profile) return null;

  const allViewed = (spots: Spot[]) => spots.every((s) => s.viewedBy.includes(profile.uid));

  return (
    <div className="rb-page">
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Spot</h1>

      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12, marginBottom: 20 }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <button
            onClick={() => (mySpots.length > 0 ? setViewing({ spots: mySpots, startIndex: 0 }) : setShowAdd(true))}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: mySpots.length > 0 ? '3px solid var(--color-brand-600)' : '2px dashed var(--color-border)',
              background: 'var(--color-brand-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {profile.photoURL ? <img src={profile.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '+'}
          </button>
          <div style={{ fontSize: 11, marginTop: 4 }}>My Spot</div>
        </div>

        {Object.entries(contactSpots).map(([uid, spots]) => {
          const viewed = allViewed(spots);
          return (
            <div key={uid} style={{ textAlign: 'center', flexShrink: 0 }}>
              <button
                onClick={() => setViewing({ spots, startIndex: 0 })}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  border: viewed ? '2px solid var(--color-border)' : '3px solid var(--color-accent)',
                  background: 'var(--color-brand-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 20,
                  color: 'var(--color-brand-600)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
              >
                {spots[0].authorPhoto ? <img src={spots[0].authorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : spots[0].authorName.charAt(0)}
              </button>
              <div style={{ fontSize: 11, marginTop: 4, maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {spots[0].authorName.split(' ')[0]}
              </div>
            </div>
          );
        })}
      </div>

      {mySpots.length > 0 && (
        <button className="rb-btn rb-btn--outline" style={{ marginBottom: 20, fontSize: 13 }} onClick={() => setShowAdd(true)}>
          + Add another Spot
        </button>
      )}

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Spot Updates</h2>
      {Object.keys(contactSpots).length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>No recent Spots from your contacts.</p>
      )}
      {Object.entries(contactSpots).map(([uid, spots]) => (
        <button
          key={uid}
          onClick={() => setViewing({ spots, startIndex: 0 })}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--color-border)', textAlign: 'left', cursor: 'pointer' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, overflow: 'hidden' }}>
            {spots[0].authorPhoto ? <img src={spots[0].authorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : spots[0].authorName.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{spots[0].authorName}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{spots.length} update{spots.length !== 1 ? 's' : ''}</div>
          </div>
        </button>
      ))}

      {showAdd && <AddSpotModal onClose={() => setShowAdd(false)} />}
      {viewing && <SpotViewer spots={viewing.spots} startIndex={viewing.startIndex} onClose={() => setViewing(null)} />}
    </div>
  );
}