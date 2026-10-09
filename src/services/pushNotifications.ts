import { isNativePlatform } from '../utils/platform';
import { addFcmToken } from './userService';

/**
 * Requires, before this works at all:
 *  1. google-services.json placed in android/app/ (Firebase Console > Project
 *     Settings > Your apps > Android app)
 *  2. GoogleService-Info.plist placed in ios/App/App/ (same page, iOS app)
 *  3. An APNs auth key uploaded to Firebase Console > Project Settings >
 *     Cloud Messaging > Apple app configuration
 * These are tied to your actual Firebase/Apple Developer accounts — I can't
 * generate them.
 */
export async function registerForPushNotifications(uid: string): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!isNativePlatform()) return 'unsupported';

  const { PushNotifications } = await import('@capacitor/push-notifications');

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return 'denied';

  await PushNotifications.register();

  return new Promise((resolve) => {
    PushNotifications.addListener('registration', async (token) => {
      await addFcmToken(uid, token.value);
      resolve('granted');
    });
    PushNotifications.addListener('registrationError', () => resolve('denied'));
  });
}

export async function setupPushListeners(onNavigate: (path: string) => void): Promise<void> {
  if (!isNativePlatform()) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const path = action.notification.data?.path;
    if (typeof path === 'string') onNavigate(path);
  });
}