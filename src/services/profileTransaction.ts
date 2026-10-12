import { isValidProfileData } from './profileState';

export interface TxSnapshot {
  exists: boolean;
  data: Record<string, unknown> | undefined;
}

/** The two operations the profile transaction needs, so it can be tested without Firebase. */
export interface TxLike<Ref> {
  get(ref: Ref): Promise<TxSnapshot>;
  set(ref: Ref, data: Record<string, unknown>): void;
}

export interface NewProfile {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  photoURL: string | null;
  bio: string;
}

export class ProfileCreationError extends Error {
  readonly code: 'username-taken';
  constructor(code: 'username-taken') {
    super(code); // message stays "username-taken" for existing callers that compare it
    this.code = code;
    this.name = 'ProfileCreationError';
  }
}

/**
 * Creates users/{uid} and reserves usernames/{username} atomically — safely.
 *
 * - Reads BOTH documents first. (The old version only read the username, so it
 *   blindly `set` users/{uid} even when a profile already existed. Firestore treats
 *   that as an UPDATE, and the rules correctly refuse to let the username change —
 *   that was the permission-denied.)
 * - A username owned by someone else -> 'username-taken'. Nothing is written.
 * - A finished profile already exists -> 'already-exists'. Nothing is written, the
 *   existing profile and username are never touched.
 * - A username already reserved by THIS uid (left over from an interrupted earlier
 *   attempt) is reused: it is not written again (rules forbid updating usernames docs)
 *   and it is never deleted.
 */
export async function createProfileInTransaction<Ref>(
  tx: TxLike<Ref>,
  refs: { usernameRef: Ref; userRef: Ref },
  profile: NewProfile,
  timestamp: () => unknown
): Promise<'created' | 'already-exists'> {
  const usernameSnap = await tx.get(refs.usernameRef);
  const userSnap = await tx.get(refs.userRef);

  if (usernameSnap.exists && usernameSnap.data?.uid !== profile.uid) {
    throw new ProfileCreationError('username-taken');
  }
  if (userSnap.exists && isValidProfileData(userSnap.data, profile.uid)) {
    return 'already-exists';
  }

  if (!usernameSnap.exists) tx.set(refs.usernameRef, { uid: profile.uid });
  tx.set(refs.userRef, {
    uid: profile.uid,
    displayName: profile.displayName,
    username: profile.username,
    email: profile.email,
    photoURL: profile.photoURL,
    createdAt: timestamp(),
    lastSeen: timestamp(),
    isOnline: true,
    bio: profile.bio,
  });
  return 'created';
}