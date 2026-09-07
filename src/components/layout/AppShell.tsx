import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { IncomingCallListener } from '../../features/calls/IncomingCallListener';

export function AppShell() {
  return (
    <div style={{ height: '100%', display: 'flex' }}>
      <div className="rb-desktop-only">
        <Sidebar />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>
        <div className="rb-mobile-only">
          <BottomNav />
        </div>
      </div>

      <IncomingCallListener />

      <style>{`
        .rb-mobile-only { display: none; }
        @media (max-width: 768px) {
          .rb-desktop-only { display: none; }
          .rb-mobile-only { display: block; }
        }
      `}</style>
    </div>
  );
}
