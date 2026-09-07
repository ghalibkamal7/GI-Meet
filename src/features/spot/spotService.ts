import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { uploadFile } from '../../services/storageService';
import type { Spot } from './spotTypes';

const SPOT_LIFETIME_MS = 24 * 60 * 60 * 1000;

function docToSpot(d: any): Spot {
  const data = d.data();
  return {
    id: d.id,
    uid: data.uid,
    authorName: data.authorName,
    authorPhoto: data.authorPhoto ?? null,
    mediaUrl: data.mediaUrl ?? null,
    mediaType: data.mediaType ?? 'none',
    text: data.text ?? '',
    emoji: data.emoji ?? null,
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    expiresAt: data.expiresAt?.toMillis?.() ?? 0,
    viewedBy: data.viewedBy ?? [],
    reactions: data.reactions ?? {},
  };
}

export async function createSpot(params: {
  uid: string;
  authorName: string;
  authorPhoto: string | null;
  text: string;
  emoji?: string | null;
  mediaFile?: File;
}): Promise<void> {
  let mediaUrl: string | null = null;
  let mediaType: Spot['mediaType'] = 'none';

  if (params.mediaFile) {
    const { promise } = uploadFile(params.mediaFile, `spots/${params.uid}`);
    const result = await promise;
    mediaUrl = result.url;
    mediaType = params.mediaFile.type.startsWith('video/') ? 'video' : 'image';
  }

  const now = Date.now();
  await addDoc(collection(db, 'spots'), {
    uid: params.uid,
    authorName: params.authorName,
    authorPhoto: params.authorPhoto,
    mediaUrl,
    mediaType,
    text: params.text.trim(),
    emoji: params.emoji ?? null,
    createdAt: serverTimestamp(),
    // Stored as a real Timestamp (not serverTimestamp()) so it can be used as
    // a Firestore TTL field — enable TTL on `expiresAt` in the Firebase
    // Console (Firestore > TTL policies) so expired spots auto-delete.
    expiresAt: Timestamp.fromMillis(now + SPOT_LIFETIME_MS),
    viewedBy: [],
    reactions: {},
  });
}

/** All non-expired spots from the given set of uids (typically the user's contacts), grouped by author. */
export function subscribeToSpotsFromUsers(uids: string[], callback: (spotsByUser: Record<string, Spot[]>) => void): Unsubscribe {
  if (uids.length === 0) {
    callback({});
    return () => undefined;
  }
  // Firestore 'in' queries cap at 30 values — fine for MVP contact-list scale.
  const q = query(collection(db, 'spots'), where('uid', 'in', uids.slice(0, 30)));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const grouped: Record<string, Spot[]> = {};
    snap.docs.forEach((d) => {
      const spot = docToSpot(d);
      if (spot.expiresAt < now) return; // client-side filter as a backstop even before TTL cleanup runs
      grouped[spot.uid] = grouped[spot.uid] ? [...grouped[spot.uid], spot] : [spot];
    });
    Object.values(grouped).forEach((list) => list.sort((a, b) => a.createdAt - b.createdAt));
    callback(grouped);
  });
}

export function subscribeToMySpots(uid: string, callback: (spots: Spot[]) => void): Unsubscribe {
  const q = query(collection(db, 'spots'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    callback(snap.docs.map(docToSpot).filter((s) => s.expiresAt > now).sort((a, b) => a.createdAt - b.createdAt));
  });
}

export async function markSpotViewed(spotId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'spots', spotId), { viewedBy: arrayUnion(uid) });
}

export async function reactToSpot(spotId: string, uid: string, emoji: string): Promise<void> {
  await updateDoc(doc(db, 'spots', spotId), { [`reactions.${uid}`]: emoji });
}

export async function deleteSpot(spotId: string): Promise<void> {
  await deleteDoc(doc(db, 'spots', spotId));
}

/** Derives a "contacts" list from 1-1 chat partners + group co-members — used to scope whose Spots you see. */
export async function getContacts(uid: string): Promise<string[]> {
  const contacts = new Set<string>();

  const chatsSnap = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', uid)));
  chatsSnap.docs.forEach((d) => {
    (d.data().participants ?? []).forEach((p: string) => p !== uid && contacts.add(p));
  });

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('members', 'array-contains', uid)));
  groupsSnap.docs.forEach((d) => {
    (d.data().members ?? []).forEach((m: string) => m !== uid && contacts.add(m));
  });

  return Array.from(contacts);
}
