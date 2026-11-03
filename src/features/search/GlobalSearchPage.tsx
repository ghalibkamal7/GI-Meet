import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchUsersByUsername } from '../../services/searchService';
import { useAuth } from '../../context/AuthContext';
import type { UserProfile } from '../../utils/types';
import { getOrCreateDirectChat } from '../chat/chatService';
import { Search, UserRound } from 'lucide-react';

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
    <div className="rb-page rb-page--narrow rb-search-page">
      <header className="rb-search-header">
        <span className="rb-eyebrow">Find your people</span>
        <h1>Search</h1>
        <p>Look up people by their username and start a conversation.</p>
      </header>
      <label className="rb-search-field">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search by username..."
          value={term}
          onChange={(e) => handleSearch(e.target.value)}
          autoFocus
          aria-label="Search people by username"
        />
      </label>

      {loading && <p className="rb-search-state" role="status">Searching…</p>}
      {!loading && term.length >= 2 && users.length === 0 && (
        <div className="rb-empty-state rb-search-empty">
          <div className="rb-empty-state__icon"><UserRound size={20} /></div>
          <h2>No people found</h2>
          <p>Try another username. To search inside a chat, open it and choose “Search in chat” from the actions menu.</p>
        </div>
      )}

      {users.map((user) => (
        <button
          key={user.uid}
          onClick={() => handleOpenChat(user)}
          className="rb-search-result"
        >
          <div className="rb-search-result__avatar">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="rb-search-result__body">
            <div className="rb-search-result__name">{user.displayName}</div>
            <div className="rb-search-result__username">@{user.username}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
