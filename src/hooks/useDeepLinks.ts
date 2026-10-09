import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { isNativePlatform } from '../utils/platform';

/**
 * Turns an incoming deep link into an in-app route.
 *
 *   https://your.domain/join-group/abc   (Android App Links / iOS Universal Links)
 *   gimeet://join-group/abc              (custom scheme — "join-group" is parsed as the HOST)
 *   gimeet:///join-group/abc             (custom scheme, empty host)
 *
 * Returns null for anything that is not a parseable URL.
 */
export function pathFromDeepLink(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const isWebLink = url.protocol === 'https:' || url.protocol === 'http:';
  const pathname = isWebLink ? url.pathname : `/${[url.host, url.pathname.replace(/^\/+/, '')].filter(Boolean).join('/')}`;
  return `${pathname}${url.search}`;
}

export function useDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativePlatform()) return;

    const listener = CapacitorApp.addListener('appUrlOpen', (event) => {
      const path = pathFromDeepLink(event.url);
      if (path) navigate(path);
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, [navigate]);
}