import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { isNativePlatform } from '../utils/platform';

const ROOT_PATHS = ['/', '/login'];

export function useBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPress = useRef(0);

  useEffect(() => {
    if (!isNativePlatform()) return;

    const listener = CapacitorApp.addListener('backButton', () => {
      const isAtRoot = ROOT_PATHS.includes(location.pathname);

      if (!isAtRoot) {
        navigate(-1);
        return;
      }

      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        CapacitorApp.exitApp();
      } else {
        lastBackPress.current = now;
        // A toast like "Press back again to exit" fits well here — wire it
        // to your existing ToastContext if you want that confirmation shown.
      }
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, [navigate, location.pathname]);
}