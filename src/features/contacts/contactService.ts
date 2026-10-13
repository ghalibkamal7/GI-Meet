import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { toMillis } from '../chat/readState';
import type { ContactChatDoc } from './contacts';

export interface AcceptedContactDoc {
  id: string;
  members: string[];
  requesterUid: string;
  recipientUid: string;
  requesterInfo?: { displayName?: string; username?: string; photoURL?: string | null };
  recipientInfo?: { displayName?: string; username?: string; photoURL?: string | null };
  acceptedAt: number;
}

/** Accepted relationships live in contacts/{sortedUidA__sortedUidB}. */
export function subscribeToMyAcceptedContacts(
  uid: string,
  onData: (contacts: AcceptedContactDoc[]) => void,
  onError: (error: unknown) => void
): () => void {
  const q = query(
    collection(db, 'contacts'),
    where('members', 'array-contains', uid)
  );

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => {
      const data = d.data({ serverTimestamps: 'estimate' });
      return {
        id: d.id,
        members: Array.isArray(data.members) ? data.members : [],
        requesterUid: typeof data.requesterUid === 'string' ? data.requesterUid : '',
        recipientUid: typeof data.recipientUid === 'string' ? data.recipientUid : '',
        requesterInfo: data.requesterInfo,
        recipientInfo: data.recipientInfo,
        acceptedAt: toMillis(data.acceptedAt),
      };
    })),
    onError
  );
}

/**
 * All chats I take part in — INCLUDING ones I "deleted" (hidden) from my chat list, because deleting a chat
 * does not make someone stop being a contact. Single array-contains filter: no composite index needed.
 */
export function subscribeToContactChats(
  uid: string,
  onData: (chats: ContactChatDoc[]) => void,
  onError: (error: unknown) => void
): () => void {
  const q = query(collection(db, 'chats'), where('participants', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            participants: data.participants ?? [],
            participantInfo: data.participantInfo ?? {},
            lastMessageAt: toMillis(data.lastMessageAt),
          };
        })
      ),
    onError
  );
}

/** users/{me}/removedContacts/* — private to me by rule. A document's id is the contact's uid. */
export function subscribeToRemovedContacts(
  uid: string,
  onData: (removed: Set<string>) => void,
  onError: (error: unknown) => void
): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'removedContacts'),
    (snap) => onData(new Set(snap.docs.map((d) => d.id))),
    onError
  );
}

/** Hides this person from MY contacts. Touches nothing else: not the chat, not their account, not their contacts. */
export async function removeContact(myUid: string, contactUid: string): Promise<void> {
  if (myUid === contactUid) throw new Error('You cannot remove yourself.');
  await setDoc(doc(db, 'users', myUid, 'removedContacts', contactUid), { removedAt: serverTimestamp() });
}

/** Undo — used automatically when I start chatting with someone I had removed. */
export async function restoreContact(myUid: string, contactUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', myUid, 'removedContacts', contactUid));
}