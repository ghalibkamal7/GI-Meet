import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { getUserProfile } from '../../services/userService';

export type ContactRequestStatus = 'pending' | 'accepted';

export interface ContactRequest {
  id: string;
  members: string[];
  requesterUid: string;
  recipientUid: string;
  status: ContactRequestStatus;
  requesterInfo?: { displayName: string; username: string; photoURL: string | null };
  recipientInfo?: { displayName: string; username: string; photoURL: string | null };
  createdAt: number;
}

function relationId(uidA: string, uidB: string): string {
  if (!uidA || !uidB || uidA === uidB) {
    throw new Error('Invalid contact request.');
  }

  return [uidA, uidB].sort().join('__');
}

function toRequest(id: string, data: Record<string, unknown>): ContactRequest {
  const timestamp = data.createdAt as { toMillis?: () => number } | number | undefined;

  return {
    id,
    members: Array.isArray(data.members) ? data.members as string[] : [],
    requesterUid: typeof data.requesterUid === 'string' ? data.requesterUid : '',
    recipientUid: typeof data.recipientUid === 'string' ? data.recipientUid : '',
    status: data.status === 'accepted' ? 'accepted' : 'pending',
    requesterInfo: data.requesterInfo as ContactRequest['requesterInfo'],
    recipientInfo: data.recipientInfo as ContactRequest['recipientInfo'],
    createdAt: typeof timestamp === 'number'
      ? timestamp
      : timestamp && typeof timestamp.toMillis === 'function'
        ? timestamp.toMillis()
        : 0,
  };
}

export function subscribeToMyContactRequests(
  uid: string,
  onData: (requests: ContactRequest[]) => void,
  onError: (error: unknown) => void
): () => void {
  const requestsQuery = query(
    collection(db, 'contactRequests'),
    where('members', 'array-contains', uid)
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => onData(snapshot.docs.map((item) => toRequest(item.id, item.data()))),
    onError
  );
}

export async function sendContactRequest(
  requesterUid: string,
  recipientUid: string
): Promise<void> {
  const id = relationId(requesterUid, recipientUid);
  const ref = doc(db, 'contactRequests', id);

  const [requester, recipient] = await Promise.all([
    getUserProfile(requesterUid),
    getUserProfile(recipientUid),
  ]);

  if (!requester || !recipient) {
    throw new Error('Could not load both user profiles.');
  }

  const requesterInfo = {
    displayName: requester.displayName,
    username: requester.username,
    photoURL: requester.photoURL ?? null,
  };
  const recipientInfo = {
    displayName: recipient.displayName,
    username: recipient.username,
    photoURL: recipient.photoURL ?? null,
  };

  // create-only write: never overwrite an existing pending or accepted relation.
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);

    if (existing.exists()) {
      const data = existing.data();

      if (data.status === 'accepted') {
        throw new Error('This user is already your contact.');
      }

      if (data.requesterUid === requesterUid && data.status === 'pending') {
        throw new Error('You have already sent a contact request.');
      }

      if (data.recipientUid === requesterUid && data.status === 'pending') {
        throw new Error('This user has already sent you a request.');
      }

      throw new Error('A contact request already exists.');
    }

    transaction.set(ref, {
      members: [requesterUid, recipientUid],
      requesterUid,
      recipientUid,
      status: 'pending',
      requesterInfo,
      recipientInfo,
      createdAt: serverTimestamp(),
    });
  });
}

export async function acceptContactRequest(
  currentUid: string,
  request: ContactRequest
): Promise<void> {
  if (request.recipientUid !== currentUid || request.status !== 'pending') {
    throw new Error('This request cannot be accepted.');
  }

  await updateDoc(doc(db, 'contactRequests', request.id), {
    status: 'accepted',
    acceptedAt: serverTimestamp(),
  });
}

export async function rejectContactRequest(
  currentUid: string,
  request: ContactRequest
): Promise<void> {
  if (request.recipientUid !== currentUid || request.status !== 'pending') {
    throw new Error('This request cannot be rejected.');
  }

  await deleteDoc(doc(db, 'contactRequests', request.id));
}

export async function removeAcceptedContact(
  currentUid: string,
  otherUid: string
): Promise<void> {
  const id = relationId(currentUid, otherUid);
  const ref = doc(db, 'contactRequests', id);

  await deleteDoc(ref);
}
