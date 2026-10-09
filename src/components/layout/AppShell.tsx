import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { IncomingCallListener } from '../../features/calls/IncomingCallListener';
import { PwaPrompts } from '../pwa/PwaPrompts';
import { isNativePlatform } from '../../utils/platform';
import { useAuth } from '../../context/AuthContext';
import { registerForPushNotifications, setupPushListeners } from '../../services/pushNotifications';

export function AppShell() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  useEffect(() => {
    if (isNativePlatform()) {
      document.body.classList.add('rb-native');
    }
  }, []);

  useEffect(() => {
    if (!profile || !isNativePlatform()) return;
    registerForPushNotifications(profile.uid);
    setupPushListeners((path) => navigate(path));
  }, [profile, navigate]);

  return (
    <div style={{ height: '100%', display: 'flex', paddingTop: 'var(--safe-top)' }}>
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
      <PwaPrompts />

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