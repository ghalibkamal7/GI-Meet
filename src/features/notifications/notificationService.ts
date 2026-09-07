import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import app, { db } from '../../firebase/firebaseConfig';

/**
 * Push notifications require:
 *  1. A VAPID key from Firebase Console > Project Settings > Cloud Messaging
 *     (set as VITE_FIREBASE_VAPID_KEY)
 *  2. public/firebase-messaging-sw.js registered (already included in this project)
 *  3. The actual "send a push" side handled server-side — see /functions,
 *     which sends via the Admin SDK when a new message/call/invite is created.
 */
export async function requestNotificationPermission(uid: string): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!(await isSupported())) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const messaging = getMessaging(app);
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] VITE_FIREBASE_VAPID_KEY is not set — cannot register for push.');
    return 'denied';
  }

  const token = await getToken(messaging, { vapidKey });
  if (token) {
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
  }
  return 'granted';
}

export async function listenForForegroundMessages(onMessageReceived: (title: string, body: string) => void) {
  if (!(await isSupported())) return;
  const messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    onMessageReceived(payload.notification?.title ?? 'GI MEET', payload.notification?.body ?? '');
  });
}
