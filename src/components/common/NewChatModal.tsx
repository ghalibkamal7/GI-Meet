import { useState } from 'react';
import { searchUsersByUsername } from '../../services/searchService';
import type { UserProfile } from '../../utils/types';

interface Props {
  currentUid: string;
  onClose: () => void;
  onSelectUser: (user: UserProfile) => void;
}

export function NewChatModal({ currentUid, onClose, onSelectUser }: Props) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const users = await searchUsersByUsername(value, currentUid);
    setResults(users);
    setLoading(false);
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card" style={{ width: 360, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>New chat</h3>
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
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No users found.</p>
          )}
          {results.map((user) => (
            <button
              key={user.uid}
              onClick={() => onSelectUser(user)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 6px',
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 8,
              }}
            >
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
                  color: 'var(--color-brand-700)',
                }}
              >
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{user.displayName}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{user.username}</div>
              </div>
            </button>
          ))}
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
