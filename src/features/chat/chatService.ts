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
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import type { Chat, Message } from './chatTypes';

const MESSAGES_PAGE_SIZE = 30;

/** Deterministic chat id for a 1-1 chat so we never create duplicates. */
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
    // Re-opening a chat you'd previously "deleted" un-hides it for you again.
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

function docToChat(d: QueryDocumentSnapshot<DocumentData>): Chat {
  const data = d.data();
  return {
    id: d.id,
    participants: data.participants ?? [],
    participantInfo: data.participantInfo ?? {},
    lastMessage: data.lastMessage ?? '',
    lastMessageAt: data.lastMessageAt?.toMillis?.() ?? 0,
    lastMessageSenderId: data.lastMessageSenderId ?? '',
    typing: data.typing ?? {},
    pinnedMessageIds: data.pinnedMessageIds ?? [],
    mutedBy: data.mutedBy ?? [],
    archivedBy: data.archivedBy ?? [],
    hiddenFor: data.hiddenFor ?? [],
    lastReadAt: data.lastReadAt ?? {},
  };
}

export function subscribeToMessages(
  chatId: string,
  callback: (messages: Message[]) => void
) {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(MESSAGES_PAGE_SIZE)
  );

  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map(docToMessage).reverse();
    callback(messages);
  });
}

/** Loads an older page of messages, for infinite-scroll-up pagination. */
export async function loadOlderMessages(
  chatId: string,
  oldestLoaded: QueryDocumentSnapshot<DocumentData>
): Promise<Message[]> {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'desc'),
    startAfter(oldestLoaded),
    limit(MESSAGES_PAGE_SIZE)
  );
  const snap = await getDocs(q);
  return snap.docs.map(docToMessage).reverse();
}

function docToMessage(d: QueryDocumentSnapshot<DocumentData>): Message {
  const data = d.data();
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
    reactions: data.reactions ?? {},
    starredBy: data.starredBy ?? [],
  };
}

export async function sendMessage(params: {
  chatId: string;
  senderId: string;
  text: string;
  replyTo?: Message['replyTo'];
  attachment?: Message['attachment'];
  forwardedFrom?: Message['forwardedFrom'];
}): Promise<void> {
  const trimmed = params.text.trim();
  if (!trimmed && !params.attachment) return;

  await addDoc(collection(db, 'chats', params.chatId, 'messages'), {
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
    starredBy: [],
  });

  await updateDoc(doc(db, 'chats', params.chatId), {
    lastMessage: params.attachment ? `📎 ${params.attachment.name}` : trimmed,
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: params.senderId,
    hiddenFor: [], // a new message un-hides the chat for both sides
  });
}

/** Forwards an existing message (text/attachment) into another chat as a new message. */
export async function forwardMessage(
  targetChatId: string,
  senderId: string,
  original: Message,
  senderName: string
): Promise<void> {
  await sendMessage({
    chatId: targetChatId,
    senderId,
    text: original.text,
    attachment: original.attachment ?? undefined,
    forwardedFrom: { senderId: original.senderId, senderName },
  });
}

export async function editMessage(chatId: string, messageId: string, newText: string): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) return;
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    text: trimmed,
    editedAt: serverTimestamp(),
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
  const field = `reactions.${emoji}`;
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    [field]: alreadyReacted ? arrayRemove(uid) : arrayUnion(uid),
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

export async function markMessageRead(
  chatId: string,
  messageId: string,
  uid: string
): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    readBy: arrayUnion(uid),
  });
}

/** Marks the whole chat "read up to now" for unread-count purposes. */
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

/** "Delete chat" — hides it from this user's list only; the other participant still sees theirs. */
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

/** Simple client-side search over already-fetched messages (loaded chats only). */
export function searchMessagesLocally(messages: Message[], term: string): Message[] {
  const lower = term.trim().toLowerCase();
  if (!lower) return [];
  return messages.filter((m) => !m.deleted && m.text.toLowerCase().includes(lower));
}

// --- Block / report (top-level, not chat-scoped) --------------------------

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
