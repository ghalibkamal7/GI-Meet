import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { authedFetch } from '../../services/authedFetch';
import { BACKEND_URL } from '../../config/backend';

export type YouTubeLiveStatus =
  | 'not_connected'
  | 'connecting'
  | 'ready'
  | 'live'
  | 'reconnecting'
  | 'ended'
  | 'error';

export interface LiveStreamState {
  status: YouTubeLiveStatus;
  watchUrl: string | null;
  startedAt: number | null;
  errorMessage: string | null;
  // Viewer count is polled by the backend from YouTube's API on an interval —
  // it is NOT real-time, and YouTube itself doesn't guarantee it's available
  // immediately after going live, so the UI must treat it as "--" until present.
  viewerCount: number | null;
}

/**
 * The `meetings/{code}/liveStream` doc is written ONLY by the backend
 * (via Firebase Admin SDK, which bypasses client security rules). Clients
 * are read-only here — see firestore.rules.
 */
export function subscribeToLiveStreamState(
  meetingCode: string,
  callback: (state: LiveStreamState | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'meetings', meetingCode, 'meta', 'liveStream'), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data();
    callback({
      status: data.status,
      watchUrl: data.watchUrl ?? null,
      startedAt: data.startedAt?.toMillis?.() ?? null,
      errorMessage: data.errorMessage ?? null,
      viewerCount: data.viewerCount ?? null,
    });
  });
}

export async function isYouTubeConnected(): Promise<boolean> {
  const res = await authedFetch('/api/youtube/status');
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.connected);
}

/**
 * Opens Google's OAuth consent screen in a popup. The backend's callback
 * route exchanges the code for tokens and stores them server-side only —
 * the frontend never sees an access or refresh token.
 */
export function connectYouTubeAccount(): Promise<boolean> {
  return new Promise((resolve) => {
    // Open the popup synchronously (in direct response to the user's click)
    // so browsers don't block it, then navigate it once we have the ID token.
    const popup = window.open('about:blank', 'youtube-oauth', 'width=500,height=650');

    (async () => {
      const user = (await import('../../firebase/firebaseConfig')).auth.currentUser;
      if (!user || !popup) {
        popup?.close();
        resolve(false);
        return;
      }
      const idToken = await user.getIdToken();
      popup.location.href = `${BACKEND_URL}/api/youtube/auth-url-redirect?idToken=${encodeURIComponent(idToken)}`;
    })();

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== new URL(BACKEND_URL).origin) return;
      if (event.data?.type === 'youtube-oauth-complete') {
        window.removeEventListener('message', handleMessage);
        popup?.close();
        resolve(Boolean(event.data.success));
      }
    };
    window.addEventListener('message', handleMessage);
  });
}

export async function startYouTubeLive(params: {
  meetingCode: string;
  title: string;
  description: string;
  privacy: 'public' | 'unlisted' | 'private';
}): Promise<void> {
  const res = await authedFetch(`/api/youtube/go-live`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Could not start the YouTube stream.');
  }
}

export async function stopYouTubeLive(meetingCode: string): Promise<void> {
  const res = await authedFetch(`/api/youtube/stop-live`, {
    method: 'POST',
    body: JSON.stringify({ meetingCode }),
  });
  if (!res.ok) throw new Error('Could not stop the YouTube stream.');
}
