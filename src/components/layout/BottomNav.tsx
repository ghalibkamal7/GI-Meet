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
      className="rb-bottom-nav"
    >
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `rb-bottom-nav__link${isActive ? ' is-active' : ''}`}
        >
          <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
