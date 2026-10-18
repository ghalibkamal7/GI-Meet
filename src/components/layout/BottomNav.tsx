import { NavLink } from 'react-router-dom';
import { MessageCircle, Phone, Video, Users, Sparkles } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Chats', Icon: MessageCircle, end: true },
  { to: '/calls', label: 'Calls', Icon: Phone },
  { to: '/meetings', label: 'Meetings', Icon: Video },
  { to: '/groups', label: 'Groups', Icon: Users },
  { to: '/spot', label: 'Spot', Icon: Sparkles },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Mobile navigation"
      style={{
        display: 'flex',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        padding: '6px 4px calc(6px + var(--safe-bottom))',
        boxShadow: '0 -6px 20px rgba(11, 51, 47, 0.05)',
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
            padding: '7px 1px 5px',
            minHeight: 54,
            fontSize: 10,
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--color-brand-600)' : 'var(--color-text-muted)',
            background: isActive ? 'var(--color-brand-100)' : 'transparent',
            borderRadius: 10,
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
