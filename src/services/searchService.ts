import { collection, query, orderBy, startAt, endAt, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type { UserProfile } from '../utils/types';

/**
 * Prefix search on username. Firestore doesn't do full-text search, so this
 * is a simple range query (`>= prefix` and `< prefix + \uf8ff`) — fine for
 * MVP scale. Move to Algolia/Typesense if search needs get more advanced.
 */
export async function searchUsersByUsername(prefix: string, excludeUid?: string): Promise<UserProfile[]> {
  const normalized = prefix.trim().toLowerCase();
  if (!normalized) return [];

  const q = query(
    collection(db, 'users'),
    orderBy('username'),
    startAt(normalized),
    endAt(normalized + '\uf8ff'),
    limit(20)
  );

  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as UserProfile)
    .filter((u) => u.uid !== excludeUid);
}
