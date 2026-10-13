import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { getUserProfile } from '../../services/userService';

export type ContactRequestStatus = 'pending';

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
    status: 'pending',
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
  const requestRef = doc(db, 'contactRequests', id);
  const contactRef = doc(db, 'contacts', id);

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

  await runTransaction(db, async (transaction) => {
    // The rules allow reading a missing contact document. Do not read a
    // missing contactRequests document: its read is intentionally denied.
    const existingContact = await transaction.get(contactRef);

    if (existingContact.exists()) {
      throw new Error('This user is already your contact.');
    }

    transaction.set(requestRef, {
      members: [requesterUid, recipientUid],
      requesterUid,
      recipientUid,
      status: 'pending',
      requesterInfo,
      recipientInfo,
      createdAt: serverTimestamp(),
    });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.startsWith('This user is already')) {
      throw error;
    }
    throw new Error(
      'Could not send the request. A request may already exist, or the operation was denied. Check pending requests and try again.'
    );
  });
}

export async function acceptContactRequest(
  currentUid: string,
  request: ContactRequest
): Promise<void> {
  if (request.recipientUid !== currentUid || request.status !== 'pending') {
    throw new Error('This request cannot be accepted.');
  }

  const requestRef = doc(db, 'contactRequests', request.id);
  const contactRef = doc(db, 'contacts', request.id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(requestRef);

    if (!snapshot.exists()) {
      throw new Error('This contact request no longer exists.');
    }

    const data = snapshot.data();

    if (
      data.status !== 'pending' ||
      data.recipientUid !== currentUid ||
      !Array.isArray(data.members) ||
      !data.members.includes(currentUid) ||
      data.requesterUid !== request.requesterUid
    ) {
      throw new Error('This request cannot be accepted.');
    }

    transaction.set(contactRef, {
      members: data.members,
      requesterUid: data.requesterUid,
      recipientUid: data.recipientUid,
      requesterInfo: data.requesterInfo,
      recipientInfo: data.recipientInfo,
      acceptedAt: serverTimestamp(),
    });

    transaction.delete(requestRef);
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

  const batch = writeBatch(db);

  batch.delete(doc(db, 'contacts', id));
  batch.set(
    doc(db, 'users', currentUid, 'removedContacts', otherUid),
    { removedAt: serverTimestamp() }
  );

  await batch.commit();
}
