import { useState } from 'react';
import { searchUsersByUsername } from '../../services/searchService';
import type { UserProfile } from '../../utils/types';
import { createGroup } from './groupService';
import { provisionGroupKey } from './groupCrypto';
import { ensureDeviceKeys } from '../chat/e2ee';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [selected, setSelected] = useState<Map<string, UserProfile>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(value: string) {
    setTerm(value);
    if (value.trim().length < 2 || !profile) {
      setResults([]);
      return;
    }
    setResults(await searchUsersByUsername(value, profile.uid));
  }

  function toggleSelect(user: UserProfile) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(user.uid)) next.delete(user.uid);
      else next.set(user.uid, user);
      return next;
    });
  }

  async function handleCreate() {
    if (!profile) return;
    if (name.trim().length < 2) {
      setError('Give the group a name (2+ characters).');
      return;
    }
    if (selected.size === 0) {
      setError('Add at least one member.');
      return;
    }

    setSubmitting(true);
    const members = [profile.uid, ...Array.from(selected.keys())];
    const memberInfo: Record<string, { displayName: string; photoURL: string | null }> = {
      [profile.uid]: { displayName: profile.displayName, photoURL: profile.photoURL },
    };
    selected.forEach((u) => {
      memberInfo[u.uid] = { displayName: u.displayName, photoURL: u.photoURL };
    });

    const groupId = await createGroup({
      name,
      description,
      createdBy: profile.uid,
      members,
      memberInfo,
    });

    try {
      const creatorPrivateKey = await ensureDeviceKeys(profile.uid);
      await provisionGroupKey(groupId, members, profile.uid, creatorPrivateKey);
    } catch {
      // Non-fatal — group chat still works, just without encryption yet.
    }

    setSubmitting(false);
    onClose();
    navigate(`/groups/${groupId}`);
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 400, padding: 20, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>New group</h3>

        <input
          className="rb-input"
          placeholder="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <textarea
          className="rb-input"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ marginBottom: 14 }}
        />

        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>
          Add members
        </label>
        <input
          className="rb-input"
          placeholder="Search by username..."
          value={term}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ marginBottom: 10 }}
        />

        {selected.size > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {Array.from(selected.values()).map((u) => (
              <span
                key={u.uid}
                onClick={() => toggleSelect(u)}
                style={{
                  fontSize: 12,
                  background: 'var(--color-brand-100)',
                  color: 'var(--color-brand-700)',
                  padding: '4px 8px',
                  borderRadius: 999,
                  cursor: 'pointer',
                }}
              >
                {u.displayName} ✕
              </span>
            ))}
          </div>
        )}

        <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 14 }}>
          {results.map((user) => (
            <button
              key={user.uid}
              onClick={() => toggleSelect(user)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                padding: '6px 4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <span>{user.displayName} <span style={{ color: 'var(--color-text-muted)' }}>@{user.username}</span></span>
              <span>{selected.has(user.uid) ? '✓' : ''}</span>
            </button>
          ))}
        </div>

        {error && <p className="rb-error-text" style={{ marginBottom: 10 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="rb-btn rb-btn--outline" onClick={onClose}>Cancel</button>
          <button className="rb-btn rb-btn--primary" onClick={handleCreate} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create group'}
          </button>
        </div>
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