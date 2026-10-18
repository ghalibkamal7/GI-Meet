import { NavLink, useNavigate } from 'react-router-dom';
import { MessageCircle, Phone, Video, Users, Sparkles, Search, LogOut } from 'lucide-react';
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
  const navigate = useNavigate();

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 14px 18px',
        background: 'var(--color-surface)',
      }}
    >
      <div style={{ padding: '0 8px 24px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <BrandMark size={26} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, letterSpacing: '-0.01em' }}>
          {appConfig.name}
        </span>
        <button
          onClick={() => navigate('/search')}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            display: 'flex',
            padding: 4,
            borderRadius: 6,
          }}
          aria-label="Search"
          title="Search"
        >
          <Search size={17} strokeWidth={1.75} />
        </button>
      </div>

      <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, paddingTop: 8 }}>
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14.5,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--color-brand-600)' : 'var(--color-text)',
              background: isActive ? 'var(--color-brand-100)' : 'transparent',
              textDecoration: 'none',
              transition: 'background 0.12s ease',
              minHeight: 44,
            })}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--color-brand-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: 13,
            color: 'var(--color-brand-600)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {profile?.photoURL ? (
            <img src={profile.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            (profile?.displayName ?? '?').charAt(0).toUpperCase()
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile?.displayName}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>@{profile?.username}</div>
        </div>
        <button
          onClick={() => logOut()}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            display: 'flex',
            padding: 6,
            borderRadius: 6,
          }}
          aria-label="Log out"
          title="Log out"
          className="rb-icon-btn"
        >
          <LogOut size={16} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
