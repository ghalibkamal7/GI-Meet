import { useState } from 'react';
import { searchUsersByUsername } from '../../services/searchService';
import { addMember } from './groupService';
import { provisionGroupKeyForNewMember } from './groupCrypto';
import { ensureDeviceKeys } from '../chat/e2ee';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { UserProfile } from '../../utils/types';

interface Props {
  groupId: string;
  existingMemberUids: string[];
  onClose: () => void;
}

export function AddMemberModal({ groupId, existingMemberUids, onClose }: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedUids, setAddedUids] = useState<Set<string>>(new Set());

  async function handleSearch(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const users = await searchUsersByUsername(value);
    setResults(users.filter((u) => !existingMemberUids.includes(u.uid)));
    setLoading(false);
  }

  async function handleAdd(user: UserProfile) {
    await addMember(groupId, user.uid, { displayName: user.displayName, photoURL: user.photoURL });
    setAddedUids((prev) => new Set(prev).add(user.uid));
    showToast(`${user.displayName} added to the group.`, 'success');

    if (profile) {
      try {
        const myPrivateKey = await ensureDeviceKeys(profile.uid);
        await provisionGroupKeyForNewMember(groupId, user.uid, profile.uid, myPrivateKey);
      } catch {
        // Non-fatal — group just continues without encryption for this member.
      }
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-label="Add group members" style={{ width: 360, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Add member</h3>
        <input
          className="rb-input"
          placeholder="Search by username..."
          value={term}
          onChange={(e) => handleSearch(e.target.value)}
          autoFocus
        />
        <div style={{ marginTop: 12, maxHeight: 280, overflowY: 'auto' }}>
          {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Searching…</p>}
          {!loading && term.length >= 2 && results.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No matching users found.</p>
          )}
          {results.map((user) => {
            const added = addedUids.has(user.uid);
            return (
              <div key={user.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px' }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--color-brand-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    color: 'var(--color-brand-600)',
                    flexShrink: 0,
                  }}
                >
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{user.displayName}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{user.username}</div>
                </div>
                <button
                  className={added ? 'rb-btn rb-btn--outline' : 'rb-btn rb-btn--primary'}
                  style={{ padding: '4px 12px', fontSize: 12 }}
                  onClick={() => handleAdd(user)}
                  disabled={added}
                >
                  {added ? 'Added' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
        <button className="rb-btn rb-btn--outline" style={{ width: '100%', marginTop: 14 }} onClick={onClose}>
          Done
        </button>
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