import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createCommunity } from './communityService';

export function CreateCommunityModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!profile) return;
    if (name.trim().length < 2) {
      setError('Give the community a name (2+ characters).');
      return;
    }
    setCreating(true);
    const communityId = await createCommunity({
      name,
      description,
      isPublic,
      createdBy: profile.uid,
      creatorInfo: { displayName: profile.displayName, photoURL: profile.photoURL },
    });
    setCreating(false);
    onClose();
    navigate(`/communities/${communityId}`);
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-label="Create community" style={{ width: 380, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>New community</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 16 }}>
          A community bundles multiple groups together under one roof, with community-wide announcements.
        </p>

        <input className="rb-input" placeholder="Community name" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />
        <textarea className="rb-input" placeholder="What's this community about?" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ marginBottom: 14 }} />

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setIsPublic(true)}
            style={optionStyle(isPublic)}
          >
            <Globe size={16} strokeWidth={1.75} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Public</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Anyone can find and join</div>
            </div>
          </button>
          <button
            onClick={() => setIsPublic(false)}
            style={optionStyle(!isPublic)}
          >
            <Lock size={16} strokeWidth={1.75} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Private</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Invite link only</div>
            </div>
          </button>
        </div>

        {error && <p className="rb-error-text" style={{ marginBottom: 10 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="rb-btn rb-btn--outline" onClick={onClose}>Cancel</button>
          <button className="rb-btn rb-btn--primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create community'}
          </button>
        </div>
      </div>
    </div>
  );
}

function optionStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 10,
    border: `1.5px solid ${active ? 'var(--color-brand-600)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-brand-100)' : 'transparent',
    cursor: 'pointer',
    color: 'var(--color-text)',
  };
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
