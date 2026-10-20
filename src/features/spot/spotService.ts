import {
  collection,
  doc,
  getDoc,
  updateDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { uploadPrivateFile } from '../../services/storageService';
import type { Spot } from './spotTypes';

const SPOT_LIFETIME_MS = 24 * 60 * 60 * 1000;

type SpotRelationship = { chatId: string } | { groupId: string };

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
  const spotRef = doc(collection(db, 'spots'));
  const audience = await getSpotAudience(params.uid);

  if (params.mediaFile) {
    const result = await uploadPrivateFile(params.mediaFile, `spots/${params.uid}/${spotRef.id}`);
    mediaUrl = result.path;
    mediaType = params.mediaFile.type.startsWith('video/') ? 'video' : 'image';
  }

  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + SPOT_LIFETIME_MS);
  const batch = writeBatch(db);
  batch.set(spotRef, {
    uid: params.uid,
    authorName: params.authorName,
    authorPhoto: params.authorPhoto,
    mediaUrl,
    mediaType,
    text: params.text.trim(),
    emoji: params.emoji ?? null,
    createdAt: serverTimestamp(),
    expiresAt,
    viewedBy: [],
    reactions: {},
  });
  audience.forEach(([viewerUid, relationship]) => {
    const audienceEntry = {
      ownerUid: params.uid,
      ...relationship,
      expiresAt,
    };
    batch.set(doc(db, 'spotFeeds', viewerUid, 'items', spotRef.id), audienceEntry);
    batch.set(doc(db, 'spots', spotRef.id, 'audience', viewerUid), audienceEntry);
  });
  await batch.commit();
}

/** Reads only feed entries created for this viewer by a validated chat/group relationship. */
export function subscribeToSpotFeed(uid: string, callback: (spotsByUser: Record<string, Spot[]>) => void): Unsubscribe {
  const q = query(
    collection(db, 'spotFeeds', uid, 'items'),
    where('expiresAt', '>', Timestamp.now())
  );
  let generation = 0;
  return onSnapshot(q, (snap) => {
    const currentGeneration = ++generation;
    void Promise.all(snap.docs.map(async (feedItem) => {
      try {
        const spotSnapshot = await getDoc(doc(db, 'spots', feedItem.id));
        return spotSnapshot.exists() ? docToSpot(spotSnapshot) : null;
      } catch (error) {
        if (
          error
          && typeof error === 'object'
          && 'code' in error
          && error.code === 'permission-denied'
        ) {
          return null;
        }
        throw error;
      }
    })).then((spots) => {
      if (currentGeneration !== generation) return;
      const grouped: Record<string, Spot[]> = {};
      spots.forEach((spot) => {
        if (!spot || spot.expiresAt <= Date.now()) return;
        grouped[spot.uid] = grouped[spot.uid] ? [...grouped[spot.uid], spot] : [spot];
      });
      Object.values(grouped).forEach((list) => list.sort((a, b) => a.createdAt - b.createdAt));
      callback(grouped);
    }).catch((error: unknown) => {
      console.error('Unable to load the authorized Spot feed.', error);
      callback({});
    });
  }, (error) => {
    console.error('Unable to subscribe to the authorized Spot feed.', error);
    callback({});
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
  const spotRef = doc(db, 'spots', spotId);
  const spotSnapshot = await getDoc(spotRef);
  if (!spotSnapshot.exists()) return;

  const audienceSnapshot = await getDocs(collection(db, 'spots', spotId, 'audience'));
  const batch = writeBatch(db);
  audienceSnapshot.docs.forEach((audienceEntry) => {
    batch.delete(doc(db, 'spotFeeds', audienceEntry.id, 'items', spotId));
    batch.delete(audienceEntry.ref);
  });
  batch.delete(spotRef);
  await batch.commit();
}

/** Derives the existing Spot audience from direct chats and shared groups. */
async function getSpotAudience(uid: string): Promise<Array<[string, SpotRelationship]>> {
  const audience = new Map<string, SpotRelationship>();

  const chatsSnap = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', uid)));
  chatsSnap.docs.forEach((d) => {
    const participants = d.data().participants ?? [];
    if (participants.length !== 2) return;
    participants.forEach((participant: string) => {
      if (participant !== uid && !audience.has(participant)) audience.set(participant, { chatId: d.id });
    });
  });

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('members', 'array-contains', uid)));
  groupsSnap.docs.forEach((d) => {
    (d.data().members ?? []).forEach((member: string) => {
      if (member !== uid && !audience.has(member)) audience.set(member, { groupId: d.id });
    });
  });

  return Array.from(audience.entries()).slice(0, 30);
}
