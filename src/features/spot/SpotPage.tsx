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
    <div className="rb-page rb-spot-page">
      <header className="rb-spot-header">
        <div>
          <span className="rb-eyebrow">A little glimpse of today</span>
          <h1>Spot</h1>
          <p>Quick updates from you and your contacts.</p>
        </div>
        <button className="rb-btn rb-btn--primary" onClick={() => setShowAdd(true)}>Share a Spot</button>
      </header>

      <section className="rb-spot-rail" aria-label="Recent Spot stories">
        <div className="rb-spot-person">
          <button
            onClick={() => (mySpots.length > 0 ? setViewing({ spots: mySpots, startIndex: 0 }) : setShowAdd(true))}
            className={`rb-spot-avatar${mySpots.length > 0 ? ' has-story' : ' is-empty'}`}
            aria-label={mySpots.length > 0 ? 'View your Spot' : 'Add a Spot'}
          >
            {profile.photoURL ? <img src={profile.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '+'}
          </button>
          <div className="rb-spot-person__name">My Spot</div>
        </div>

        {Object.entries(contactSpots).map(([uid, spots]) => {
          const viewed = allViewed(spots);
          return (
            <div key={uid} className="rb-spot-person">
              <button
                onClick={() => setViewing({ spots, startIndex: 0 })}
                className={`rb-spot-avatar${viewed ? ' is-viewed' : ' has-story'}`}
                aria-label={`View ${spots[0].authorName}'s Spot`}
              >
                {spots[0].authorPhoto ? <img src={spots[0].authorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : spots[0].authorName.charAt(0)}
              </button>
              <div className="rb-spot-person__name">
                {spots[0].authorName.split(' ')[0]}
              </div>
            </div>
          );
        })}
      </section>

      {mySpots.length > 0 && (
        <button className="rb-btn rb-btn--outline" style={{ marginBottom: 20, fontSize: 13 }} onClick={() => setShowAdd(true)}>
          + Add another Spot
        </button>
      )}

      <div className="rb-section-heading rb-spot-section-heading">
        <h2>Recent updates</h2>
        <span>{Object.keys(contactSpots).length} contacts</span>
      </div>
      {Object.keys(contactSpots).length === 0 && (
        <div className="rb-empty-state rb-spot-empty">
          <h2>Nothing new just yet</h2>
          <p>When your contacts share a Spot, it will show up here.</p>
        </div>
      )}
      {Object.entries(contactSpots).map(([uid, spots]) => (
        <button
          key={uid}
          onClick={() => setViewing({ spots, startIndex: 0 })}
          className="rb-spot-update-row"
        >
          <div className="rb-spot-update-row__avatar">
            {spots[0].authorPhoto ? <img src={spots[0].authorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : spots[0].authorName.charAt(0)}
          </div>
          <div className="rb-spot-update-row__body">
            <div className="rb-spot-update-row__name">{spots[0].authorName}</div>
            <div className="rb-spot-update-row__meta">{spots.length} update{spots.length !== 1 ? 's' : ''}</div>
          </div>
        </button>
      ))}

      {showAdd && <AddSpotModal onClose={() => setShowAdd(false)} />}
      {viewing && <SpotViewer spots={viewing.spots} startIndex={viewing.startIndex} onClose={() => setViewing(null)} />}
    </div>
  );
}