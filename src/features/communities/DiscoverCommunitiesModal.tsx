import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { discoverPublicCommunities, joinCommunity } from './communityService';
import type { Community } from './communityTypes';

export function DiscoverCommunitiesModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    discoverPublicCommunities(profile.uid).then((list) => {
      setCommunities(list);
      setLoading(false);
    });
  }, [profile]);

  async function handleJoin(community: Community) {
    if (!profile) return;
    setJoiningId(community.id);
    await joinCommunity(community.id, profile.uid, { displayName: profile.displayName, photoURL: profile.photoURL });
    setJoiningId(null);
    onClose();
    navigate(`/communities/${community.id}`);
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 400, padding: 20, maxHeight: '75vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 14 }}>Discover communities</h3>

        {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading…</p>}
        {!loading && communities.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No public communities to join yet.</p>
        )}

        {communities.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users size={12} strokeWidth={1.75} /> {c.members.length} members · {c.groupIds.length} groups
              </div>
            </div>
            <button className="rb-btn rb-btn--primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => handleJoin(c)} disabled={joiningId === c.id}>
              {joiningId === c.id ? 'Joining…' : 'Join'}
            </button>
          </div>
        ))}
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
  zIndex: 100,
};
