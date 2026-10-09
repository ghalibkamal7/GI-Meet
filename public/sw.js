/* GI Meet service worker
 *
 * Scope of responsibility — deliberately small:
 *   - keeps the static app shell (index.html + hashed /assets/* bundles + a few
 *     static files) so the app can load offline;
 *   - nothing else.
 *
 * What this worker NEVER does:
 *   - it never intercepts cross-origin requests, which covers Firebase Auth,
 *     Firestore, Firebase Storage, LiveKit, Google APIs and the backend API;
 *   - it never touches non-GET requests (uploads, writes), Range requests
 *     (video/audio streaming) or blob:/data: URLs;
 *   - it never caches a response that is private (Cache-Control no-store/private,
 *     Vary: Cookie/Authorization), non-200, or redirected;
 *   - it never stores chat data, E2EE keys, tokens or user profile data — those
 *     are not same-origin static files, so they never reach any cache here.
 *
 * Updates are user-controlled: a newly installed worker waits until the page
 * posts { type: 'SKIP_WAITING' } (see src/pwa/pwa.ts), so an open call/meeting
 * or half-written message is never reloaded out from under the user.
 *
 * The Firebase Cloud Messaging worker (/firebase-messaging-sw.js) is registered
 * by Firebase under its own scope (/firebase-cloud-messaging-push-scope) and is
 * left completely alone here.
 */
'use strict';

// Bump this to force every client to drop all old caches on the next activation.
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'gi-meet-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-${CACHE_VERSION}`;
const KNOWN_CACHES = new Set([SHELL_CACHE, ASSET_CACHE]);

const SHELL_URL = '/index.html';
const EXTRA_PRECACHE_URLS = ['/manifest.webmanifest'];
const MAX_ASSET_ENTRIES = 80;

// Same-origin paths this worker must never handle.
const BYPASS_PREFIXES = ['/__/', '/api/', '/.well-known/'];
const BYPASS_PATHS = new Set(['/sw.js', '/firebase-messaging-sw.js']);
const STATIC_FILE_PATTERN = /\.(?:png|jpe?g|svg|ico|webp|woff2?|webmanifest)$/i;

// ---------------------------------------------------------------------------
// Response safety checks
// ---------------------------------------------------------------------------

function isPrivateResponse(response) {
  const cacheControl = response.headers.get('cache-control') || '';
  const vary = response.headers.get('vary') || '';
  return /no-store|private/i.test(cacheControl) || /cookie|authorization/i.test(vary);
}

function isHtmlResponse(response) {
  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

function isBasicOk(response) {
  return Boolean(response) && response.status === 200 && response.type === 'basic' && !response.redirected;
}

// The HTML shell: must be real HTML, not redirected, not private.
function isCacheableShell(response) {
  return isBasicOk(response) && isHtmlResponse(response) && !isPrivateResponse(response);
}

// Static files/bundles: must NOT be HTML. Hosts with an SPA rewrite answer a
// missing /assets/foo.js with index.html and a 200 — caching that would poison
// the cache with HTML under a JavaScript URL.
function isCacheableAsset(response) {
  return isBasicOk(response) && !isHtmlResponse(response) && !isPrivateResponse(response);
}

function shouldBypass(url) {
  if (BYPASS_PATHS.has(url.pathname)) return true;
  return BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Install: precache the shell and the hashed bundles it references
// ---------------------------------------------------------------------------

function extractAssetUrls(html) {
  const urls = new Set();
  const pattern = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
  let match = pattern.exec(html);
  while (match) {
    urls.add(match[1]);
    match = pattern.exec(html);
  }
  return Array.from(urls);
}

async function cacheAsset(cache, url) {
  try {
    const response = await fetch(url);
    if (isCacheableAsset(response)) await cache.put(url, response);
  } catch (error) {
    // Offline or blocked right now — runtime caching picks the file up later.
  }
}

async function precacheShell() {
  const shellCache = await caches.open(SHELL_CACHE);
  const assetCache = await caches.open(ASSET_CACHE);

  // `reload` bypasses the HTTP cache so we never precache a stale shell.
  const shellResponse = await fetch(SHELL_URL, { cache: 'reload' }).catch(() => null);
  if (shellResponse && isCacheableShell(shellResponse)) {
    await shellCache.put(SHELL_URL, shellResponse.clone());
    const html = await shellResponse.text();
    await Promise.all(extractAssetUrls(html).map((url) => cacheAsset(assetCache, url)));
  }

  // Optional files: a missing one must never fail the whole install.
  await Promise.all(
    EXTRA_PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(url);
        if (isCacheableAsset(response)) await shellCache.put(url, response);
      } catch (error) {
        // ignore
      }
    })
  );
}

self.addEventListener('install', (event) => {
  // No skipWaiting() here on purpose: an updated worker waits for the user.
  event.waitUntil(precacheShell());
});

// ---------------------------------------------------------------------------
// Activate: drop old versions of OUR caches only, then take control
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && !KNOWN_CACHES.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---------------------------------------------------------------------------
// Fetch strategies
// ---------------------------------------------------------------------------

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i += 1) {
    await cache.delete(keys[i]);
  }
}

// HTML navigations: network first so a new deploy is picked up immediately;
// the cached shell is only a fallback for when the network is unavailable.
async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    const { pathname } = new URL(request.url);
    const isAppRoute = !/\.[a-z0-9]+$/i.test(pathname); // never overwrite the shell with some other .html page
    if (isAppRoute && isCacheableShell(response)) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(SHELL_URL);
    return cached || Response.error();
  }
}

// Hashed bundles never change for a given URL, so cache-first is safe.
async function cacheFirstAsset(request, event) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableAsset(response)) {
    await cache.put(request, response.clone());
    event.waitUntil(trimCache(cache, MAX_ASSET_ENTRIES));
  }
  return response;
}

// Icons, fonts, the manifest: serve fast from cache, refresh in the background.
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const refresh = fetch(request)
    .then(async (response) => {
      if (isCacheableAsset(response)) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return; // Firebase, LiveKit, Google APIs, backend...
  if (shouldBypass(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(request, event));
    return;
  }
  if (STATIC_FILE_PATTERN.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
  // Everything else: not handled — the browser deals with it as usual.
});