const STORAGE_KEY = 'gi-meet-redirect-after-login';

export function saveRedirectTarget(path: string): void {
  if (['/login', '/signup', '/setup-profile'].includes(path)) return;
  sessionStorage.setItem(STORAGE_KEY, path);
}

export function consumeRedirectTarget(): string | null {
  const path = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  return path;
}