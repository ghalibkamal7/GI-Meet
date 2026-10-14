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
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  deleteDoc,
  setDoc,
} from 'firebase/firestore';

const rules = await readFile('firestore.rules', 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId: 'gi-meet-regression-403-test',
  firestore: { rules },
});

try {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const mallory = testEnv.authenticatedContext('mallory').firestore();

  const pairId = 'alice__bob';
  const requestRef = doc(alice, 'contactRequests', pairId);
  const contactRefAlice = doc(alice, 'contacts', pairId);
  const contactRefBob = doc(bob, 'contacts', pairId);
  const contactRefMallory = doc(mallory, 'contacts', pairId);

  // -------------------------------------------------------------------------
  // REGRESSION 1: The Production 403 BatchGetDocuments / Read on missing contacts
  // In production, missing contacts read returned 403 Forbidden because rules
  // for /contacts were not deployed. With the correct rules, this must succeed.
  // -------------------------------------------------------------------------
  console.log('REGRESSION TEST 1: Reading missing contact document before creation succeeds (no 403)');
  const missingContactSnap = await assertSucceeds(getDoc(contactRefAlice));
  if (missingContactSnap.exists()) {
    throw new Error('Expected contact document to not exist initially');
  }

  // -------------------------------------------------------------------------
  // REGRESSION 2: The Production 403 on subscribeToMyAcceptedContacts query
  // In production, collection('contacts').where('members', 'array-contains', uid)
  // returned 403 because rules were missing in production.
  // -------------------------------------------------------------------------
  console.log('REGRESSION TEST 2: Querying contacts for signed-in user succeeds (no 403)');
  const emptyContactsQuery = await assertSucceeds(
    getDocs(query(collection(alice, 'contacts'), where('members', 'array-contains', 'alice')))
  );
  if (!emptyContactsQuery.empty) {
    throw new Error('Expected empty contacts query initially');
  }

  console.log('REGRESSION TEST 3: Outsider querying another user\'s contacts is denied');
  await assertFails(
    getDocs(query(collection(mallory, 'contacts'), where('members', 'array-contains', 'alice')))
  );

  // -------------------------------------------------------------------------
  // REGRESSION 4: The sendContactRequest transaction
  // Reads contacts/{pairId} to verify non-existence, then writes contactRequests/{pairId}.
  // In production, this failed with 403 at transaction.get(contactRef).
  // -------------------------------------------------------------------------
  console.log('REGRESSION TEST 4: sendContactRequest transaction succeeds when no contact exists');
  const requesterInfo = { displayName: 'Alice', username: 'alice', photoURL: null };
  const recipientInfo = { displayName: 'Bob', username: 'bob', photoURL: null };

  await assertSucceeds(
    runTransaction(alice, async (transaction) => {
      const existingContact = await transaction.get(contactRefAlice);
      if (existingContact.exists()) {
        throw new Error('This user is already your contact.');
      }
      transaction.set(requestRef, {
        members: ['alice', 'bob'],
        requesterUid: 'alice',
        recipientUid: 'bob',
        status: 'pending',
        requesterInfo,
        recipientInfo,
        createdAt: serverTimestamp(),
      });
    })
  );

  // -------------------------------------------------------------------------
  // REGRESSION 5: Duplicate pending request rejected safely
  // Overwriting an existing pending request is an update, which is denied (allow update: if false)
  // -------------------------------------------------------------------------
  console.log('REGRESSION TEST 5: Duplicate request cannot overwrite pending request');
  await assertFails(
    setDoc(requestRef, {
      members: ['alice', 'bob'],
      requesterUid: 'alice',
      recipientUid: 'bob',
      status: 'pending',
      requesterInfo,
      recipientInfo,
      createdAt: serverTimestamp(),
    })
  );

  // Outsider cannot read pending request
  console.log('REGRESSION TEST 6: Outsider cannot read pending contactRequests');
  await assertFails(getDoc(doc(mallory, 'contactRequests', pairId)));

  // -------------------------------------------------------------------------
  // REGRESSION 7: Accepting request creates contact and deletes pending request atomically
  // -------------------------------------------------------------------------
  console.log('REGRESSION TEST 7: Bob accepts request atomically');
  await assertSucceeds(
    runTransaction(bob, async (transaction) => {
      const pendingSnapshot = await transaction.get(doc(bob, 'contactRequests', pairId));
      if (!pendingSnapshot.exists()) throw new Error('Request not found');
      const data = pendingSnapshot.data();
      transaction.set(contactRefBob, {
        members: data.members,
        requesterUid: data.requesterUid,
        recipientUid: data.recipientUid,
        requesterInfo: data.requesterInfo,
        recipientInfo: data.recipientInfo,
        acceptedAt: serverTimestamp(),
      });
      transaction.delete(doc(bob, 'contactRequests', pairId));
    })
  );

  // Now contact exists: members can read, outsider cannot
  console.log('REGRESSION TEST 8: Members can read accepted contact; outsider cannot');
  await assertSucceeds(getDoc(contactRefAlice));
  await assertSucceeds(getDoc(contactRefBob));
  await assertFails(getDoc(contactRefMallory));

  // Querying now returns 1 contact for Alice and Bob
  const aliceContactsSnap = await assertSucceeds(
    getDocs(query(collection(alice, 'contacts'), where('members', 'array-contains', 'alice')))
  );
  if (aliceContactsSnap.size !== 1) {
    throw new Error(`Expected 1 contact for Alice, got ${aliceContactsSnap.size}`);
  }

  // -------------------------------------------------------------------------
  // REGRESSION 9: Existing contact prevents sending new request
  // -------------------------------------------------------------------------
  console.log('REGRESSION TEST 9: Cannot send request when contact already exists');
  await assertFails(
    setDoc(doc(alice, 'contactRequests', pairId), {
      members: ['alice', 'bob'],
      requesterUid: 'alice',
      recipientUid: 'bob',
      status: 'pending',
      requesterInfo,
      recipientInfo,
      createdAt: serverTimestamp(),
    })
  );

  // -------------------------------------------------------------------------
  // REGRESSION 10: Seed chat and messages, then remove contact atomically
  // -------------------------------------------------------------------------
  console.log('REGRESSION TEST 10: Removing contact removes relationship and writes private marker without deleting chat');
  const chatRef = doc(alice, 'chats', pairId);
  const msgRef = doc(alice, 'chats', pairId, 'messages', 'msg-1');
  const aliceMarkerRef = doc(alice, 'users', 'alice', 'removedContacts', 'bob');

  // Seed chat and message
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const rawDb = context.firestore();
    await setDoc(doc(rawDb, 'chats', pairId), {
      participants: ['alice', 'bob'],
      participantInfo: {
        alice: { displayName: 'Alice' },
        bob: { displayName: 'Bob' },
      },
      lastMessageAt: Date.now(),
      archivedBy: [],
    });
    await setDoc(doc(rawDb, 'chats', pairId, 'messages', 'msg-1'), {
      senderId: 'alice',
      text: 'Hello Bob',
      timestamp: Date.now(),
    });
  });

  // Alice removes Bob using removeAcceptedContact() batch
  const removeBatch = writeBatch(alice);
  removeBatch.delete(contactRefAlice);
  removeBatch.set(aliceMarkerRef, { removedAt: serverTimestamp() });
  await assertSucceeds(removeBatch.commit());

  // Verify contact is gone, marker exists, chat & messages stay intact
  const [removedContactSnap, markerSnap, chatSnap, msgSnap] = await Promise.all([
    getDoc(contactRefAlice),
    getDoc(aliceMarkerRef),
    getDoc(chatRef),
    getDoc(msgRef),
  ]);
  if (removedContactSnap.exists()) throw new Error('Contact should be deleted');
  if (!markerSnap.exists()) throw new Error('Private marker should exist');
  if (!chatSnap.exists()) throw new Error('Chat should remain');
  if (!msgSnap.exists()) throw new Error('Message should remain');

  // Outsider & Bob cannot read Alice's private removal marker
  console.log('REGRESSION TEST 11: Private removal marker is strictly private to Alice');
  await assertFails(getDoc(doc(bob, 'users', 'alice', 'removedContacts', 'bob')));
  await assertFails(getDoc(doc(mallory, 'users', 'alice', 'removedContacts', 'bob')));

  // -------------------------------------------------------------------------
  // REGRESSION 12: Reconnection - sending and accepting a new request after removal
  // -------------------------------------------------------------------------
  console.log('REGRESSION TEST 12: Reconnecting - Alice can send a new request after removal');
  await assertSucceeds(
    runTransaction(alice, async (transaction) => {
      const contactSnap = await transaction.get(contactRefAlice);
      if (contactSnap.exists()) throw new Error('Should not exist');
      transaction.set(requestRef, {
        members: ['alice', 'bob'],
        requesterUid: 'alice',
        recipientUid: 'bob',
        status: 'pending',
        requesterInfo,
        recipientInfo,
        createdAt: serverTimestamp(),
      });
    })
  );

  console.log('REGRESSION TEST 13: Bob accepts new request, re-establishing contact while chat history persists');
  await assertSucceeds(
    runTransaction(bob, async (transaction) => {
      const pendingSnap = await transaction.get(doc(bob, 'contactRequests', pairId));
      if (!pendingSnap.exists()) throw new Error('Pending request not found');
      const data = pendingSnap.data();
      transaction.set(contactRefBob, {
        members: data.members,
        requesterUid: data.requesterUid,
        recipientUid: data.recipientUid,
        requesterInfo: data.requesterInfo,
        recipientInfo: data.recipientInfo,
        acceptedAt: serverTimestamp(),
      });
      transaction.delete(doc(bob, 'contactRequests', pairId));
    })
  );

  const [reestablishedContact, recheckChat, recheckMsg] = await Promise.all([
    getDoc(contactRefAlice),
    getDoc(chatRef),
    getDoc(msgRef),
  ]);
  if (!reestablishedContact.exists()) throw new Error('Contact should exist again');
  if (!recheckChat.exists()) throw new Error('Chat must still exist');
  if (!recheckMsg.exists()) throw new Error('Message must still exist');

  console.log('ALL REGRESSION TESTS PASSED SUCCESSFULLY');
} finally {
  await testEnv.cleanup();
}
