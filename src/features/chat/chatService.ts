import {
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  where,
  getDocs,
  runTransaction,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import type { Chat, Message } from './chatTypes';
import { toMillis, timestampMapToMillis } from './readState';
import { ENCRYPTED_PREVIEW_FALLBACK } from './previewText';

const MESSAGES_PAGE_SIZE = 30;

// Longest ciphertext kept on the chat document for list previews.
const MAX_PREVIEW_CIPHERTEXT_CHARS = 4096;

export function directChatId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

export async function getOrCreateDirectChat(
  currentUid: string,
  currentUserInfo: { displayName: string; photoURL: string | null },
  otherUid: string,
  otherUserInfo: { displayName: string; photoURL: string | null }
): Promise<string> {
  const chatId = directChatId(currentUid, otherUid);
  const chatRef = doc(db, 'chats', chatId);
  const snap = await getDoc(chatRef);

  if (!snap.exists()) {
    await setDoc(chatRef, {
      participants: [currentUid, otherUid],
      participantInfo: {
        [currentUid]: currentUserInfo,
        [otherUid]: otherUserInfo,
      },
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: '',
      typing: {},
      pinnedMessageIds: [],
      mutedBy: [],
      archivedBy: [],
      hiddenFor: [],
      lastReadAt: {},
    });
  } else if (snap.data().hiddenFor?.includes(currentUid)) {
    await updateDoc(chatRef, { hiddenFor: arrayRemove(currentUid) });
  }

  return chatId;
}

export function subscribeToUserChats(uid: string, callback: (chats: Chat[]) => void) {
  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc')
  );

  return onSnapshot(q, (snap) => {
    const chats = snap.docs.map(docToChat).filter((c) => !c.hiddenFor.includes(uid));
    callback(chats);
  });
}

/** Live view of ONE chat document (read markers, last message, ...). */
export function subscribeToChat(
  chatId: string,
  callback: (chat: Chat | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'chats', chatId),
    (snap) => callback(snap.exists() ? docToChat(snap as QueryDocumentSnapshot<DocumentData>) : null),
    onError
  );
}

function docToChat(d: QueryDocumentSnapshot<DocumentData>): Chat {
  // 'estimate': a serverTimestamp() that is still being written reads as the local time
  // instead of null, so a pending write can never flip a value back to "missing" (unread flicker).
  const data = d.data({ serverTimestamps: 'estimate' });
  return {
    id: d.id,
    participants: data.participants ?? [],
    participantInfo: data.participantInfo ?? {},
    lastMessage: data.lastMessage ?? '',
   lastMessageAt: toMillis(data.lastMessageAt),
    lastMessageSenderId: data.lastMessageSenderId ?? '',
    typing: data.typing ?? {},
    pinnedMessageIds: data.pinnedMessageIds ?? [],
    mutedBy: data.mutedBy ?? [],
    archivedBy: data.archivedBy ?? [],
    hiddenFor: data.hiddenFor ?? [],
    lastReadAt: timestampMapToMillis(data.lastReadAt),
    lastMessageCipher: data.lastMessageCipher ?? null,
    lastMessageIv: data.lastMessageIv ?? null,
  };
}

export interface MessagePage {
  messages: Message[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export function subscribeToMessages(
  chatId: string,
  callback: (messages: Message[], page: Pick<MessagePage, 'cursor' | 'hasMore'>) => void,
  onError?: (error: Error) => void
) {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(MESSAGES_PAGE_SIZE)
  );

  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs.map(docToMessage).reverse();
      callback(messages, {
        cursor: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === MESSAGES_PAGE_SIZE,
      });
    },
    onError
  );
}

export async function loadOlderMessages(
  chatId: string,
  oldestLoaded: QueryDocumentSnapshot<DocumentData>
): Promise<Message[]> {
  return (await loadOlderMessagePage(chatId, oldestLoaded)).messages;
}

export async function loadOlderMessagePage(
  chatId: string,
  oldestLoaded: QueryDocumentSnapshot<DocumentData>
): Promise<MessagePage> {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'desc'),
    startAfter(oldestLoaded),
    limit(MESSAGES_PAGE_SIZE)
  );
  const snap = await getDocs(q);
  return {
    messages: snap.docs.map(docToMessage).reverse(),
    cursor: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === MESSAGES_PAGE_SIZE,
  };
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

export async function sendMessage(params: {
  chatId: string;
  senderId: string;
  text: string;
  encrypted: true;
  replyTo?: Message['replyTo'];
  attachment?: Message['attachment'];
  forwardedFrom?: Message['forwardedFrom'];
  iv?: string;
}): Promise<void> {
  if (params.encrypted !== true) throw new Error('Messages must be encrypted before sending.');
  const trimmed = params.text.trim();
  if (!trimmed && !params.attachment) return;
  if (trimmed && !params.iv) throw new Error('Encrypted messages require an initialization vector.');
  if (params.attachment && (!params.attachment.encrypted || !params.attachment.iv)) {
    throw new Error('Chat attachments must be encrypted before sending.');
  }

  const messageRef = doc(collection(db, 'chats', params.chatId, 'messages'));
  const chatRef = doc(db, 'chats', params.chatId);
  const batch = writeBatch(db);
  batch.set(messageRef, {
    chatId: params.chatId,
    senderId: params.senderId,
    text: trimmed,
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
    encrypted: Boolean(params.encrypted),
    iv: params.iv ?? null,
  });

  // Keep message creation and its chat preview update atomic. If either write is
  // denied, the UI must not report failure after leaving a persisted message.
  const keepCipherPreview = Boolean(
    params.encrypted && params.iv && !params.attachment && trimmed.length <= MAX_PREVIEW_CIPHERTEXT_CHARS
  );

  batch.update(chatRef, {
    lastMessage: params.attachment ? `📎 ${params.attachment.name}` : params.encrypted ? ENCRYPTED_PREVIEW_FALLBACK : trimmed,
    lastMessageCipher: keepCipherPreview ? trimmed : null,
    lastMessageIv: keepCipherPreview ? params.iv ?? null : null,
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: params.senderId,
    hiddenFor: [],
  });
  await batch.commit();
}

export async function editMessage(chatId: string, messageId: string, newText: string, encryption?: { encrypted: boolean; iv: string }): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) return;
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    text: trimmed,
    editedAt: serverTimestamp(),
    encrypted: Boolean(encryption?.encrypted),
    iv: encryption?.iv ?? null,
  });
}

export async function deleteMessage(chatId: string, messageId: string): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    deleted: true,
    text: '',
    attachment: null,
  });
}

export async function toggleReaction(chatId: string, messageId: string, emoji: string, uid: string, alreadyReacted: boolean): Promise<void> {
  await toggleMessageReaction(doc(db, 'chats', chatId, 'messages', messageId), emoji, uid, alreadyReacted);
}

export async function toggleMessageReaction(
  messageRef: DocumentReference,
  emoji: string,
  uid: string,
  alreadyReacted: boolean
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(messageRef);
    if (!snapshot.exists()) throw new Error('Message not found.');
    const data = snapshot.data();
    const userReactions = data.reactionUsers?.[uid];
    const legacyReactions = data.reactions ?? {};
    const current = Array.isArray(userReactions)
      ? userReactions
      : Object.entries(legacyReactions)
        .filter(([, uids]) => Array.isArray(uids) && uids.includes(uid))
        .map(([reaction]) => reaction);
    const next = alreadyReacted
      ? current.filter((reaction) => reaction !== emoji)
      : current.includes(emoji)
        ? current
        : [...current, emoji];

    transaction.update(messageRef, { [`reactionUsers.${uid}`]: next });
  });
}

export async function toggleStar(chatId: string, messageId: string, uid: string, alreadyStarred: boolean): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    starredBy: alreadyStarred ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function togglePin(chatId: string, messageId: string, alreadyPinned: boolean): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    pinnedMessageIds: alreadyPinned ? arrayRemove(messageId) : arrayUnion(messageId),
  });
}

export async function markMessageRead(chatId: string, messageId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    readBy: arrayUnion(uid),
  });
}

export async function markChatRead(chatId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    [`lastReadAt.${uid}`]: serverTimestamp(),
  });
}

export async function setTyping(chatId: string, uid: string, isTyping: boolean): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    [`typing.${uid}`]: isTyping,
  });
}

export async function toggleMuteChat(chatId: string, uid: string, muted: boolean): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    mutedBy: muted ? arrayUnion(uid) : arrayRemove(uid),
  });
}

export async function toggleArchiveChat(chatId: string, uid: string, archived: boolean): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    archivedBy: archived ? arrayUnion(uid) : arrayRemove(uid),
  });
}

export async function deleteChatForMe(chatId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    hiddenFor: arrayUnion(uid),
  });
}

export async function getStarredMessages(chatId: string, uid: string): Promise<Message[]> {
  const q = query(collection(db, 'chats', chatId, 'messages'), where('starredBy', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map(docToMessage);
}

export function searchMessagesLocally(messages: Message[], term: string): Message[] {
  const lower = term.trim().toLowerCase();
  if (!lower) return [];
  return messages.filter((m) => !m.deleted && m.text.toLowerCase().includes(lower));
}

export async function blockUser(uid: string, blockedUid: string): Promise<void> {
  await setDoc(doc(db, 'blocks', `${uid}_${blockedUid}`), {
    blockerUid: uid,
    blockedUid,
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(uid: string, blockedUid: string): Promise<void> {
  await deleteDoc(doc(db, 'blocks', `${uid}_${blockedUid}`));
}

export async function isUserBlocked(uid: string, otherUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'blocks', `${uid}_${otherUid}`));
  return snap.exists();
}

export async function reportUser(reporterUid: string, reportedUid: string, reason: string, context?: string): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterUid,
    reportedUid,
    reason,
    context: context ?? null,
    createdAt: serverTimestamp(),
    status: 'open',
  });
}