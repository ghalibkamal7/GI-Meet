import { NavLink } from 'react-router-dom';
import { MessageCircle, Phone, Video, Users, Sparkles, Search, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { appConfig } from '../../config/appConfig';
import { BrandMark } from '../common/BrandMark';

const NAV_ITEMS = [
  { to: '/', label: 'Chats', Icon: MessageCircle, end: true },
  { to: '/calls', label: 'Calls', Icon: Phone },
  { to: '/meetings', label: 'Meetings', Icon: Video },
  { to: '/groups', label: 'Groups', Icon: Users },
  { to: '/spot', label: 'Spot', Icon: Sparkles },
];

export function Sidebar() {
  const { profile, logOut } = useAuth();

  return (
    <aside className="rb-sidebar">
      <div className="rb-sidebar__brand">
        <BrandMark size={28} />
        <span className="rb-sidebar__wordmark">
          {appConfig.name}
        </span>
      </div>

      <div className="rb-sidebar__section-label">Your workspace</div>
      <nav aria-label="Main navigation" className="rb-sidebar__nav">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `rb-sidebar__link${isActive ? ' is-active' : ''}`}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="rb-sidebar__footer">
        <NavLink to="/search" className={({ isActive }) => `rb-sidebar__link rb-sidebar__utility${isActive ? ' is-active' : ''}`}>
          <Search size={17} strokeWidth={1.75} aria-hidden="true" />
          Search
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `rb-sidebar__link rb-sidebar__utility${isActive ? ' is-active' : ''}`}>
          <Settings size={17} strokeWidth={1.75} aria-hidden="true" />
          Settings
        </NavLink>
        <div className="rb-sidebar__account">
          <div className="rb-sidebar__avatar">
          {profile?.photoURL ? (
            <img src={profile.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            (profile?.displayName ?? '?').charAt(0).toUpperCase()
          )}
          </div>
          <div className="rb-sidebar__account-info">
          <div className="rb-sidebar__account-name">
            {profile?.displayName}
          </div>
          <div className="rb-sidebar__account-handle">@{profile?.username}</div>
          </div>
          <button type="button" onClick={() => void logOut()} aria-label="Log out" title="Log out" className="rb-sidebar__logout">
            <LogOut size={17} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );
}
