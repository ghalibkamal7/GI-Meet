import { auth } from '../firebase/firebaseConfig';
import { BACKEND_URL } from '../config/backend';

/**
 * Every backend route verifies this ID token server-side (Firebase Admin SDK)
 * before doing anything privileged. Never trust a uid passed in the request body alone.
 */
export async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken();

  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      ...(options.headers ?? {}),
    },
  });
}
