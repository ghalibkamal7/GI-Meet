import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { IncomingCallListener } from '../../features/calls/IncomingCallListener';
import { PwaPrompts } from '../pwa/PwaPrompts';
import { isNativePlatform } from '../../utils/platform';
import { useAuth } from '../../context/AuthContext';
import { registerForPushNotifications, setupPushListeners } from '../../services/pushNotifications';

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const isConversationRoute = pathname.startsWith('/chat/') || /^\/groups\/[^/]+$/.test(pathname);

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
    <div className={`rb-app-shell${isConversationRoute ? ' rb-app-shell--conversation' : ''}`}>
      <div className="rb-desktop-only rb-sidebar-slot">
        <Sidebar />
      </div>

      <div className="rb-app-main">
        <main className="rb-route-content">
          <Outlet />
        </main>
        <div className="rb-mobile-only rb-bottom-nav-slot">
          <BottomNav />
        </div>
      </div>

      <IncomingCallListener />
      <PwaPrompts />
    </div>
  );
}