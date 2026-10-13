import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'gi-meet-delete-isolation',
  firestore: { rules },
});

try {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const requestRef = doc(alice, 'contactRequests', 'alice__bob');

  await assertSucceeds(setDoc(requestRef, {
    members: ['alice', 'bob'],
    requesterUid: 'alice',
    recipientUid: 'bob',
    status: 'pending',
    requesterInfo: { displayName: 'Alice', username: 'alice', photoURL: null },
    recipientInfo: { displayName: 'Bob', username: 'bob', photoURL: null },
    createdAt: serverTimestamp(),
  }));

  console.log('Pending request created. Testing Bob direct delete...');
  await assertSucceeds(deleteDoc(doc(bob, 'contactRequests', 'alice__bob')));
  console.log('DIRECT RECIPIENT DELETE PASSED');
} finally {
  await env.cleanup();
}
