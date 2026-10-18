import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import type { Group, Announcement } from './groupTypes';
import type { Message } from '../chat/chatTypes';
import { toMillis, timestampMapToMillis } from '../chat/readState';
import { ENCRYPTED_PREVIEW_FALLBACK } from '../chat/previewText';
import { toggleMessageReaction } from '../chat/chatService';
import { joinGroupInvite, resolveGroupInvite } from '../../services/invitationService';

function generateInviteCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function createGroup(params: {
  name: string;
  description: string;
  createdBy: string;
  members: string[];
  memberInfo: Record<string, { displayName: string; photoURL: string | null }>;
  isRoom?: boolean;
}): Promise<string> {
  const docRef = await addDoc(collection(db, 'groups'), {
    name: params.name.trim(),
    description: params.description.trim(),
    photoURL: null,
    members: params.members,
    admins: [params.createdBy],
    coAdmins: [],
    memberInfo: params.memberInfo,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    inviteCode: generateInviteCode(),
    mutedBy: [],
    pinnedMessageIds: [],
    isRoom: Boolean(params.isRoom),
    communityId: null,
  });
  return docRef.id;
}

export function subscribeToUserGroups(uid: string, callback: (groups: Group[]) => void) {
  const q = query(
    collection(db, 'groups'),
    where('members', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc')
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map(docToGroup)));
}

export function subscribeToGroup(groupId: string, callback: (group: Group | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'groups', groupId), (snap) => {
    callback(snap.exists() ? docToGroup(snap as QueryDocumentSnapshot<DocumentData>) : null);
  });
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const snap = await getDoc(doc(db, 'groups', groupId));
  return snap.exists() ? docToGroup(snap as QueryDocumentSnapshot<DocumentData>) : null;
}

export async function getGroupByInviteCode(inviteCode: string) {
  try {
    return await resolveGroupInvite(inviteCode);
  } catch (error) {
    if (error instanceof Error && error.message.includes('invalid or has expired')) return null;
    throw error;
  }
}

function docToGroup(d: QueryDocumentSnapshot<DocumentData>): Group {
  // 'estimate': a pending serverTimestamp() reads as local time instead of null.
  const data = d.data({ serverTimestamps: 'estimate' });
  return {
    id: d.id,
    name: data.name,
    description: data.description ?? '',
    photoURL: data.photoURL ?? null,
    members: data.members ?? [],
    admins: data.admins ?? [],
    coAdmins: data.coAdmins ?? [],
    memberInfo: data.memberInfo ?? {},
    createdBy: data.createdBy,
    createdAt: data.createdAt?.toMillis?.() ?? 0,
    lastMessage: data.lastMessage ?? '',
    lastMessageAt: toMillis(data.lastMessageAt),
    lastMessageSenderId: data.lastMessageSenderId ?? '',
    lastReadAt: timestampMapToMillis(data.lastReadAt),
    inviteCode: data.inviteCode ?? '',
    mutedBy: data.mutedBy ?? [],
    pinnedMessageIds: data.pinnedMessageIds ?? [],
    isRoom: Boolean(data.isRoom),
    communityId: data.communityId ?? null,
  };
}

export async function updateGroupInfo(
  groupId: string,
  updates: { name?: string; description?: string; photoURL?: string }
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), updates);
}

export async function addMember(groupId: string, uid: string, info: { displayName: string; photoURL: string | null }): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    members: arrayUnion(uid),
    [`memberInfo.${uid}`]: info,
  });
}

export async function joinGroupByInviteCode(inviteCode: string): Promise<string | null> {
  const group = await getGroupByInviteCode(inviteCode);
  if (!group) return null;
  return joinGroupInvite(inviteCode);
}

export async function removeMember(groupId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    members: arrayRemove(uid),
    admins: arrayRemove(uid),
    coAdmins: arrayRemove(uid),
  });
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  await removeMember(groupId, uid);
}

export async function makeAdmin(groupId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { admins: arrayUnion(uid) });
}

export async function makeCoAdmin(groupId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { coAdmins: arrayUnion(uid) });
}

export async function removeCoAdmin(groupId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { coAdmins: arrayRemove(uid) });
}

export async function toggleMuteGroup(groupId: string, uid: string, muted: boolean): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    mutedBy: muted ? arrayUnion(uid) : arrayRemove(uid),
  });
}

export async function toggleGroupAsRoom(groupId: string, isRoom: boolean): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { isRoom });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupId));
}

export async function postAnnouncement(groupId: string, postedBy: string, postedByName: string, text: string): Promise<void> {
  await addDoc(collection(db, 'groups', groupId, 'announcements'), {
    text: text.trim(),
    postedBy,
    postedByName,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToAnnouncements(groupId: string, callback: (items: Announcement[]) => void) {
  const q = query(collection(db, 'groups', groupId, 'announcements'), orderBy('createdAt', 'desc'), limit(10));
  return onSnapshot(q, (snap) =>
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, text: data.text, postedBy: data.postedBy, postedByName: data.postedByName, createdAt: data.createdAt?.toMillis?.() ?? Date.now() };
      })
    )
  );
}

export function subscribeToGroupMessages(groupId: string, callback: (messages: Message[]) => void) {
  const q = query(collection(db, 'groups', groupId, 'messages'), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(q, (snap) => callback(snap.docs.map(docToMessage).reverse()));
}

function docToMessage(d: QueryDocumentSnapshot<DocumentData>): Message {
  const data = d.data();
  const reactions: Record<string, string[]> = Object.fromEntries(
    Object.entries(data.reactions ?? {}).map(([emoji, uids]) => [
      emoji,
      Array.isArray(uids) ? [...uids] : [],
    ])
  );
  const reactionUsers = data.reactionUsers ?? {};
  for (const [uid, emojis] of Object.entries(reactionUsers)) {
    for (const [emoji, uids] of Object.entries(reactions)) {
      reactions[emoji] = uids.filter((reactingUid) => reactingUid !== uid);
    }
    if (Array.isArray(emojis)) {
      for (const emoji of emojis) {
        reactions[emoji] = [...(reactions[emoji] ?? []), uid];
      }
    }
  }
  return {
    id: d.id,
    chatId: data.chatId,
    senderId: data.senderId,
    text: data.text ?? '',
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    editedAt: data.editedAt?.toMillis?.() ?? null,
    readBy: data.readBy ?? [],
    replyTo: data.replyTo ?? null,
    forwardedFrom: data.forwardedFrom ?? null,
    deleted: Boolean(data.deleted),
    attachment: data.attachment ?? null,
    reactions,
    starredBy: data.starredBy ?? [],
    encrypted: Boolean(data.encrypted),
iv: data.iv ?? null,
  };
}

export async function sendGroupMessage(params: {
  groupId: string;
  senderId: string;
  text: string;
  encrypted?: boolean;
  iv?: string;
  replyTo?: Message['replyTo'];
  attachment?: Message['attachment'];
  forwardedFrom?: Message['forwardedFrom'];
}): Promise<void> {
  const trimmed = params.text.trim();
  if (!trimmed && !params.attachment) return;

  await addDoc(collection(db, 'groups', params.groupId, 'messages'), {
    chatId: params.groupId,
    senderId: params.senderId,
    text: trimmed,
    encrypted: Boolean(params.encrypted),
    iv: params.iv ?? null,
    createdAt: serverTimestamp(),
    editedAt: null,
    readBy: [params.senderId],
    replyTo: params.replyTo ?? null,
    forwardedFrom: params.forwardedFrom ?? null,
    deleted: false,
    attachment: params.attachment ?? null,
    reactions: {},
    reactionUsers: {},
    starredBy: [],
  });

  await updateDoc(doc(db, 'groups', params.groupId), {
    lastMessage: params.attachment
      ? `📎 ${params.attachment.name}`
      : params.encrypted
        ? ENCRYPTED_PREVIEW_FALLBACK
        : trimmed,
    lastMessageSenderId: params.senderId,
    lastMessageAt: serverTimestamp(),
  });
}
export async function editGroupMessage(
  groupId: string,
  messageId: string,
  newText: string,
  encryption?: { encrypted: boolean; iv: string }
): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) return;

  await updateDoc(doc(db, 'groups', groupId, 'messages', messageId), {
    text: trimmed,
    encrypted: encryption?.encrypted ?? false,
    iv: encryption?.iv ?? null,
    editedAt: serverTimestamp(),
  });
}

export async function deleteGroupMessage(groupId: string, messageId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'messages', messageId), { deleted: true, text: '', attachment: null });
}

export async function toggleGroupReaction(groupId: string, messageId: string, emoji: string, uid: string, already: boolean): Promise<void> {
  await toggleMessageReaction(doc(db, 'groups', groupId, 'messages', messageId), emoji, uid, already);
}

export async function toggleGroupStar(groupId: string, messageId: string, uid: string, already: boolean): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'messages', messageId), {
    starredBy: already ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function toggleGroupPin(groupId: string, messageId: string, already: boolean): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    pinnedMessageIds: already ? arrayRemove(messageId) : arrayUnion(messageId),
  });
}
/** Marks the group as read for ONE member (every member has their own entry in lastReadAt). */
export async function markGroupRead(groupId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { [`lastReadAt.${uid}`]: serverTimestamp() });
}