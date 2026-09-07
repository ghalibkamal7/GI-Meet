import { NavLink } from 'react-router-dom';
import { MessageCircle, Phone, Video, Users, Sparkles, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Chats', Icon: MessageCircle, end: true },
  { to: '/calls', label: 'Calls', Icon: Phone },
  { to: '/meetings', label: 'Meetings', Icon: Video },
  { to: '/groups', label: 'Groups', Icon: Users },
  { to: '/spot', label: 'Spot', Icon: Sparkles },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

export function BottomNav() {
  return (
    <nav
      style={{
        display: 'flex',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            padding: '9px 0 7px',
            fontSize: 10.5,
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--color-brand-700)' : 'var(--color-text-muted)',
            textDecoration: 'none',
          })}
        >
          <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
