import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchUsersByUsername } from '../../services/searchService';
import { useAuth } from '../../context/AuthContext';
import type { UserProfile } from '../../utils/types';
import { getOrCreateDirectChat } from '../chat/chatService';

export function GlobalSearchPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(value: string) {
    setTerm(value);
    if (value.trim().length < 2 || !profile) {
      setUsers([]);
      return;
    }
    setLoading(true);
    setUsers(await searchUsersByUsername(value, profile.uid));
    setLoading(false);
  }

  async function handleOpenChat(user: UserProfile) {
    if (!profile) return;
    const chatId = await getOrCreateDirectChat(
      profile.uid,
      { displayName: profile.displayName, photoURL: profile.photoURL },
      user.uid,
      { displayName: user.displayName, photoURL: user.photoURL }
    );
    navigate(`/chat/${chatId}`);
  }

  return (
    <div className="rb-page rb-page--narrow">
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Search</h1>
      <input
        className="rb-input"
        placeholder="Search people by username..."
        value={term}
        onChange={(e) => handleSearch(e.target.value)}
        autoFocus
        style={{ marginBottom: 16 }}
      />

      {loading && <p style={{ color: 'var(--color-text-muted)' }}>Searching…</p>}
      {!loading && term.length >= 2 && users.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>No people found. To search inside a specific chat, open it and select “Search in chat” from the chat actions menu.</p>
      )}

      {users.map((user) => (
        <button
          key={user.uid}
          onClick={() => handleOpenChat(user)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '10px 6px',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid var(--color-border)',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--color-brand-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              color: 'var(--color-brand-600)',
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
  );
}
