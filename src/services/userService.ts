import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
  arrayUnion,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type { UserProfile } from '../utils/types';
import { normalizeUsername } from '../utils/validators';

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'usernames', normalizeUsername(username)));
  return snap.exists();
}

export async function createUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  photoURL?: string | null;
  bio?: string;
}): Promise<UserProfile> {
  const username = normalizeUsername(params.username);
  const userRef = doc(db, 'users', params.uid);
  const usernameRef = doc(db, 'usernames', username);

  await runTransaction(db, async (tx) => {
    const usernameSnap = await tx.get(usernameRef);
    if (usernameSnap.exists()) {
      throw new Error('username-taken');
    }

    tx.set(usernameRef, { uid: params.uid });
    tx.set(userRef, {
      uid: params.uid,
      displayName: params.displayName,
      username,
      email: params.email,
      photoURL: params.photoURL ?? null,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      isOnline: true,
      bio: params.bio?.trim() ?? '',
    });
  });

  const created = await getDoc(userRef);
  return created.data() as UserProfile;
}

export async function updateOnlineStatus(uid: string, isOnline: boolean): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    { isOnline, lastSeen: serverTimestamp() },
    { merge: true }
  );
}

export async function updateProfileFields(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'photoURL'>>
): Promise<void> {
  await setDoc(doc(db, 'users', uid), updates, { merge: true });
}

export async function updateUserPublicKey(uid: string, publicKeyJwk: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { publicKeyJwk }, { merge: true });
}

export async function updatePrivacySettings(
  uid: string,
  privacy: { showLastSeen: boolean; showOnlineStatus: boolean }
): Promise<void> {
  await setDoc(doc(db, 'users', uid), { privacy }, { merge: true });
}

/** Registers one device's push token — arrayUnion so a user can have multiple devices. */
export async function addFcmToken(uid: string, token: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) }, { merge: true });
}

export function timestampToMillis(value: Timestamp | number | undefined): number {
  if (typeof value === 'number') return value;
  return value?.toMillis?.() ?? Date.now();
}