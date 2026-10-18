import { useSyncExternalStore } from 'react';
import { isNativePlatform } from '../utils/platform';

/**
 * Web/PWA install + update state. One small module, no dependencies.
 *
 * - Browsers that support it (Chrome, Edge, Android browsers) fire
 *   `beforeinstallprompt`; we capture it so the UI can offer "Install GI Meet".
 * - iOS Safari has no such event, so the UI shows manual Add-to-Home-Screen steps.
 * - The service worker (public/sw.js) is registered only in production web
 *   builds — never inside the Capacitor native apps, which ship their own
 *   bundled assets and must not have a web cache sitting in front of them.
 * - Updates are always user-triggered. Nothing here reloads the page by itself.
 *
 * Nothing in this file touches chat data, encryption keys or tokens. The only
 * thing persisted is a UI preference (when the install banner was dismissed).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaSnapshot {
  /** Running as an installed PWA, or inside the native Capacitor app. */
  isInstalled: boolean;
  /** The browser offered a native install prompt that we can trigger. */
  canInstall: boolean;
  /** iOS browser that is not installed — show the manual Add to Home Screen steps. */
  showIosInstructions: boolean;
  /** The user dismissed the install UI recently. */
  installDismissed: boolean;
  /** A newer version of the app is ready to load. */
  updateAvailable: boolean;
}

export type UpdateRisk = 'call' | 'unsaved-text';

const DISMISS_KEY = 'gi-meet-install-dismissed-until';
const DISMISS_DAYS = 14;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MIN_CHECK_GAP_MS = 5 * 60 * 1000;
const SKIP_WAITING_FALLBACK_MS = 3000;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let appVersionChanged = false;
let updateRequested = false;
let lastUpdateCheck = 0;
let initialized = false;

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativePlatform()) return true;
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const classicIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const iPadOsDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return classicIos || iPadOsDesktopMode;
}

function readInstallDismissed(): boolean {
  try {
    return Date.now() < Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
  } catch {
    return false; // storage blocked — treat as "not dismissed"
  }
}

// ---------------------------------------------------------------------------
// Tiny external store (consumed through useSyncExternalStore)
// ---------------------------------------------------------------------------

function computeSnapshot(): PwaSnapshot {
  const installed = isRunningStandalone();
  return {
    isInstalled: installed,
    canInstall: !installed && deferredPrompt !== null,
    showIosInstructions: !installed && isIosBrowser(),
    installDismissed: readInstallDismissed(),
    updateAvailable: waitingWorker !== null || appVersionChanged,
  };
}

let snapshot: PwaSnapshot = computeSnapshot();
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = computeSnapshot();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PwaSnapshot {
  return snapshot;
}

export function usePwa(): PwaSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export function dismissInstallPrompt(days: number = DISMISS_DAYS): void {
  deferredPrompt = null;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
  } catch {
    // storage blocked — the banner may reappear next visit, which is acceptable
  }
  emit();
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null; // a captured prompt can only be used once
  emit();

  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'dismissed') dismissInstallPrompt();
    return outcome;
  } finally {
    // Always discard the one-shot event, including when prompt() rejects.
    deferredPrompt = null;
    emit();
  }
}

function attachInstallListeners(): void {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    // If the user dismissed our custom install card, leave installation UI to
    // the browser rather than suppressing it without offering another action.
    if (readInstallDismissed()) return;
    event.preventDefault(); // The custom Install button triggers the deferred prompt.
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });

  window.matchMedia('(display-mode: standalone)').addEventListener('change', emit);
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

/** What would be lost if the page reloaded right now, if anything. */
export function getUpdateRisk(): UpdateRisk | null {
  const path = window.location.pathname;
  if (path.startsWith('/call/') || /^\/meeting\/[^/]+\/room/.test(path)) return 'call';

  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'textarea, input:not([type]), input[type="text"], input[type="search"]'
  );
  return Array.from(fields).some((field) => field.value.trim().length > 0) ? 'unsaved-text' : null;
}

/** Called only from an explicit user action ("Update"). */
export function applyUpdate(): void {
  updateRequested = true;

  if (waitingWorker) {
    // The new worker activates, takes control, and the controllerchange
    // listener below reloads. The timer is a safety net if that never fires.
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    window.setTimeout(() => window.location.reload(), SKIP_WAITING_FALLBACK_MS);
    return;
  }

  // New app version, same worker file: HTML is fetched network-first, so a
  // plain reload picks up the new bundles.
  window.location.reload();
}

function findEntryScriptPath(html: string): string | null {
  for (const match of html.matchAll(/<script\b[^>]*>/g)) {
    const tag = match[0];
    if (!/type=["']module["']/.test(tag)) continue;
    const src = /\bsrc=["']([^"']*\/assets\/[^"']+)["']/.exec(tag);
    if (src) return new URL(src[1], window.location.origin).pathname;
  }
  return null;
}

/**
 * Detects a new deploy even when public/sw.js itself did not change: compares
 * the hashed entry bundle this page is running with the one a fresh index.html
 * references. This fetch is a normal sub-request (not a navigation), so the
 * service worker does not intercept it and the answer is always live.
 */
async function checkForNewAppVersion(): Promise<void> {
  if (appVersionChanged) return;
  const running = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  if (!running) return;

  try {
    const response = await fetch('/', { cache: 'no-store', headers: { Accept: 'text/html' } });
    if (!response.ok) return;
    const latest = findEntryScriptPath(await response.text());
    if (latest && latest !== new URL(running.src).pathname) {
      appVersionChanged = true;
      emit();
    }
  } catch {
    // offline — try again at the next check
  }
}

function runUpdateChecks(registration: ServiceWorkerRegistration, force = false): void {
  const now = Date.now();
  if (!force && now - lastUpdateCheck < MIN_CHECK_GAP_MS) return;
  lastUpdateCheck = now;
  registration.update().catch(() => undefined);
  void checkForNewAppVersion();
}

async function registerServiceWorker(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });

    if (registration.waiting && navigator.serviceWorker.controller) {
      waitingWorker = registration.waiting;
      emit();
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // "installed" with an existing controller = an update that is waiting for the user.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorker = registration.waiting ?? installing;
          emit();
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateRequested) {
        window.location.reload();
        return;
      }
      // Another tab applied the update, or this is the very first activation.
      waitingWorker = null;
      emit();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') runUpdateChecks(registration);
    });
    window.setInterval(() => runUpdateChecks(registration, true), UPDATE_CHECK_INTERVAL_MS);
  } catch (error) {
    console.warn('[pwa] Service worker registration failed', error);
  }
}

// ---------------------------------------------------------------------------
// Entry point — call once, before React renders
// ---------------------------------------------------------------------------

export function initPwa(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  attachInstallListeners();

  if (isNativePlatform()) return; // native apps bundle their own assets: no web service worker
  if (!import.meta.env.PROD) return; // keep dev/HMR free of a caching worker
  if (!('serviceWorker' in navigator)) return;

  if (document.readyState === 'complete') {
    void registerServiceWorker();
  } else {
    window.addEventListener('load', () => void registerServiceWorker());
  }
}