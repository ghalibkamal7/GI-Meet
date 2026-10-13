import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  where,
} from 'firebase/firestore';

const projectId = 'gi-meet-rules-test';
const rules = await readFile('firestore.rules', 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules },
});

try {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const mallory = testEnv.authenticatedContext('mallory').firestore();

  const requestId = 'alice__bob';
  const requestRef = doc(alice, 'contactRequests', requestId);
  const contactRef = doc(bob, 'contacts', requestId);

  console.log('TEST 1: Missing request read is denied');
  await assertFails(getDoc(requestRef));

  console.log('TEST 2: Alice creates pending request');
  await assertSucceeds(setDoc(requestRef, {
    members: ['alice', 'bob'],
    requesterUid: 'alice',
    recipientUid: 'bob',
    status: 'pending',
    requesterInfo: { displayName: 'Alice', username: 'alice', photoURL: null },
    recipientInfo: { displayName: 'Bob', username: 'bob', photoURL: null },
    createdAt: serverTimestamp(),
  }));

  console.log('TEST 3: Bob can read request; Mallory cannot');
  await assertSucceeds(getDoc(doc(bob, 'contactRequests', requestId)));
  await assertFails(getDoc(doc(mallory, 'contactRequests', requestId)));

  console.log('TEST 4: Request cannot be overwritten or accepted by update');
  await assertFails(setDoc(requestRef, {
    members: ['alice', 'bob'],
    requesterUid: 'alice',
    recipientUid: 'bob',
    status: 'pending',
    requesterInfo: {},
    recipientInfo: {},
    createdAt: serverTimestamp(),
  }));
  await assertFails(setDoc(requestRef, {
    members: ['alice', 'bob'],
    requesterUid: 'alice',
    recipientUid: 'bob',
    status: 'accepted',
  }));

  console.log('TEST 5: Only Bob can atomically accept the pending request');
  const contactData = {
    members: ['alice', 'bob'],
    requesterUid: 'alice',
    recipientUid: 'bob',
    requesterInfo: { displayName: 'Alice', username: 'alice', photoURL: null },
    recipientInfo: { displayName: 'Bob', username: 'bob', photoURL: null },
    acceptedAt: serverTimestamp(),
  };

  await assertFails(setDoc(doc(mallory, 'contacts', requestId), contactData));

  await assertSucceeds(runTransaction(bob, async (transaction) => {
    const pendingRequest = await transaction.get(doc(bob, 'contactRequests', requestId));
    if (!pendingRequest.exists()) throw new Error('Pending request not found');
    if (pendingRequest.data().recipientUid !== 'bob') throw new Error('Not the recipient');
    transaction.set(doc(bob, 'contacts', requestId), contactData);
    transaction.delete(doc(bob, 'contactRequests', requestId));
  }));

  await assertSucceeds(getDoc(doc(alice, 'contacts', requestId)));
  await assertFails(getDoc(doc(bob, 'contactRequests', requestId)));

  console.log('TEST 6: Only relationship members can read contact');
  await assertSucceeds(getDoc(doc(alice, 'contacts', requestId)));
  await assertSucceeds(getDoc(contactRef));
  await assertFails(getDoc(doc(mallory, 'contacts', requestId)));

  console.log('TEST 7: Members can list their contacts; outsider cannot');
  await assertSucceeds(getDocs(query(
    collection(alice, 'contacts'),
    where('members', 'array-contains', 'alice')
  )));
  await assertFails(getDocs(query(
    collection(mallory, 'contacts'),
    where('members', 'array-contains', 'alice')
  )));

  console.log('TEST 8: Requester cannot reject; recipient can delete a fresh pending request');
  const freshRequestId = 'alice__charlie';
  const freshRequestRef = doc(alice, 'contactRequests', freshRequestId);
  await assertSucceeds(setDoc(freshRequestRef, {
    members: ['alice', 'charlie'],
    requesterUid: 'alice',
    recipientUid: 'charlie',
    status: 'pending',
    requesterInfo: { displayName: 'Alice', username: 'alice', photoURL: null },
    recipientInfo: { displayName: 'Charlie', username: 'charlie', photoURL: null },
    createdAt: serverTimestamp(),
  }));
  const charlie = testEnv.authenticatedContext('charlie').firestore();
  await assertFails(deleteDoc(doc(alice, 'contactRequests', freshRequestId)));
  await assertSucceeds(deleteDoc(doc(charlie, 'contactRequests', freshRequestId)));

  console.log('TEST 9: Relationship member can remove; outsider cannot');
  await assertFails(deleteDoc(doc(mallory, 'contacts', requestId)));
  await assertSucceeds(deleteDoc(doc(alice, 'contacts', requestId)));

  console.log('ALL TESTS PASSED');
} finally {
  await testEnv.cleanup();
}
