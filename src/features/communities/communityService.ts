import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import type { Community, CommunityAnnouncement } from './communityTypes';
import { createGroup } from '../groups/groupService';
import {
  joinCommunityInvite as joinByInvite,
  joinPublicCommunity,
  resolveCommunityInvite,
} from '../../services/invitationService';

function generateInviteCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function docToCommunity(d: QueryDocumentSnapshot<DocumentData>): Community {
  const data = d.data();
  return {
    id: d.id,
    name: data.name,
    description: data.description ?? '',
    photoURL: data.photoURL ?? null,
    isPublic: Boolean(data.isPublic),
    createdBy: data.createdBy,
    admins: data.admins ?? [],
    members: data.members ?? [],
    memberInfo: data.memberInfo ?? {},
    groupIds: data.groupIds ?? [],
    announcementGroupId: data.announcementGroupId ?? null,
    inviteCode: data.inviteCode ?? '',
    createdAt: data.createdAt?.toMillis?.() ?? 0,
  };
}

export async function createCommunity(params: {
  name: string;
  description: string;
  isPublic: boolean;
  createdBy: string;
  creatorInfo: { displayName: string; photoURL: string | null };
}): Promise<string> {
  // Every community gets a built-in "Announcements" group that every member
  // auto-joins — this is what lets an admin message the whole community at
  // once, the same pattern WhatsApp/Discord communities use.
  const announcementGroupId = await createGroup({
    name: `${params.name} Announcements`,
    description: 'Community-wide announcements',
    createdBy: params.createdBy,
    members: [params.createdBy],
    memberInfo: { [params.createdBy]: params.creatorInfo },
  });

  const docRef = await addDoc(collection(db, 'communities'), {
    name: params.name.trim(),
    description: params.description.trim(),
    photoURL: null,
    isPublic: params.isPublic,
    createdBy: params.createdBy,
    admins: [params.createdBy],
    members: [params.createdBy],
    memberInfo: { [params.createdBy]: params.creatorInfo },
    groupIds: [announcementGroupId],
    announcementGroupId,
    inviteCode: generateInviteCode(),
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'groups', announcementGroupId), { communityId: docRef.id });

  return docRef.id;
}

export function subscribeToUserCommunities(uid: string, callback: (communities: Community[]) => void) {
  const q = query(collection(db, 'communities'), where('members', 'array-contains', uid));
  return onSnapshot(q, (snap) => callback(snap.docs.map(docToCommunity)));
}

/** Public communities the user hasn't joined yet — for a "Discover" browse list. */
export async function discoverPublicCommunities(excludeUid: string): Promise<Community[]> {
  const q = query(collection(db, 'communities'), where('isPublic', '==', true), limit(30));
  const snap = await getDocs(q);
  return snap.docs.map(docToCommunity).filter((c) => !c.members.includes(excludeUid));
}

export async function getCommunity(communityId: string): Promise<Community | null> {
  const snap = await getDoc(doc(db, 'communities', communityId));
  return snap.exists() ? docToCommunity(snap as QueryDocumentSnapshot<DocumentData>) : null;
}

export async function getCommunityByInviteCode(inviteCode: string) {
  try {
    return await resolveCommunityInvite(inviteCode);
  } catch (error) {
    if (error instanceof Error && error.message.includes('invalid or has expired')) return null;
    throw error;
  }
}

export async function joinCommunity(communityId: string): Promise<void> {
  await joinPublicCommunity(communityId);
}

export async function joinCommunityByInviteCode(inviteCode: string): Promise<string> {
  return joinByInvite(inviteCode);
}

export async function leaveCommunity(communityId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'communities', communityId), {
    members: arrayRemove(uid),
    admins: arrayRemove(uid),
  });
}

export async function makeCommunityAdmin(communityId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'communities', communityId), { admins: arrayUnion(uid) });
}

export async function updateCommunityInfo(
  communityId: string,
  updates: { name?: string; description?: string; photoURL?: string; isPublic?: boolean }
): Promise<void> {
  await updateDoc(doc(db, 'communities', communityId), updates);
}

/** Creates a brand-new group as a sub-group of this community. */
export async function createSubGroup(
  communityId: string,
  params: { name: string; description: string; createdBy: string; creatorInfo: { displayName: string; photoURL: string | null } }
): Promise<string> {
  const groupId = await createGroup({
    name: params.name,
    description: params.description,
    createdBy: params.createdBy,
    members: [params.createdBy],
    memberInfo: { [params.createdBy]: params.creatorInfo },
  });
  await updateDoc(doc(db, 'groups', groupId), { communityId });
  await updateDoc(doc(db, 'communities', communityId), { groupIds: arrayUnion(groupId) });
  return groupId;
}

export async function removeSubGroup(communityId: string, groupId: string): Promise<void> {
  await updateDoc(doc(db, 'communities', communityId), { groupIds: arrayRemove(groupId) });
  await updateDoc(doc(db, 'groups', groupId), { communityId: null });
}

export async function deleteCommunity(communityId: string): Promise<void> {
  await deleteDoc(doc(db, 'communities', communityId));
}

// --- Community-wide announcements (posted into the built-in announcement group) ---

export function subscribeToCommunityAnnouncements(communityId: string, callback: (items: CommunityAnnouncement[]) => void) {
  const q = query(collection(db, 'communities', communityId, 'announcements'), orderBy('createdAt', 'desc'), limit(10));
  return onSnapshot(q, (snap) =>
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, text: data.text, postedBy: data.postedBy, postedByName: data.postedByName, createdAt: data.createdAt?.toMillis?.() ?? Date.now() };
      })
    )
  );
}

export async function postCommunityAnnouncement(communityId: string, postedBy: string, postedByName: string, text: string): Promise<void> {
  await addDoc(collection(db, 'communities', communityId, 'announcements'), {
    text: text.trim(),
    postedBy,
    postedByName,
    createdAt: serverTimestamp(),
  });
}
