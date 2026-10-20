import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
  arrayUnion,
  type DocumentReference,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type { UserProfile } from '../utils/types';
import { normalizeUsername } from '../utils/validators';
import { createProfileInTransaction } from './profileTransaction';
import { chooseRegisteredPublicKey } from '../features/chat/deviceKeyPolicy';

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

/** Raw existence + data of users/{uid}. Throws on permission/network errors (so callers can tell "missing" from "failed"). */
export async function fetchUserProfileDoc(uid: string): Promise<{ exists: boolean; data: unknown }> {
  const snap = await getDoc(doc(db, 'users', uid));
  return { exists: snap.exists(), data: snap.data() };
}

/** Who owns this username? null = free. A malformed reservation counts as owned by someone else. */
export async function getUsernameOwner(username: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'usernames', normalizeUsername(username)));
  if (!snap.exists()) return null;
  const owner = snap.data()?.uid;
  return typeof owner === 'string' ? owner : 'unknown';
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  return (await getUsernameOwner(username)) !== null;
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

  await runTransaction(db, (tx) =>
    createProfileInTransaction<DocumentReference>(
      {
        get: async (ref) => {
          const snap = await tx.get(ref);
          return { exists: snap.exists(), data: snap.data() };
        },
        set: (ref, data) => {
          tx.set(ref, data);
        },
      },
      { usernameRef, userRef },
      {
        uid: params.uid,
        email: params.email,
        displayName: params.displayName,
        username,
        photoURL: params.photoURL ?? null,
        bio: params.bio?.trim() ?? '',
      },
      () => serverTimestamp()
    )
  );

  const created = await getDoc(userRef);
  return created.data() as UserProfile;
}

export async function updateOnlineStatus(uid: string, isOnline: boolean): Promise<void> {
  await setDoc(doc(db, 'users', uid), { isOnline, lastSeen: serverTimestamp() }, { merge: true });
}

export async function updateProfileFields(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'photoURL'>>
): Promise<void> {
  await setDoc(doc(db, 'users', uid), updates, { merge: true });
}

/** Publishes this device's E2EE public key so others can encrypt messages to this user. */
export async function registerUserPublicKeyIfAbsent(uid: string, publicKeyJwk: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', uid);
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists()) throw new Error('Cannot register an encryption key without an account profile.');
    const decision = chooseRegisteredPublicKey(snapshot.data().publicKeyJwk, publicKeyJwk);
    if (decision.shouldRegister) transaction.update(userRef, { publicKeyJwk: decision.publicKeyJwk });
  });
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