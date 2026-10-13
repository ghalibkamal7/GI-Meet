import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'gi-meet-create-isolation',
  firestore: { rules },
});

try {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();

  await assertSucceeds(setDoc(doc(alice, 'contactRequests', 'alice__bob'), {
    members: ['alice', 'bob'],
    requesterUid: 'alice',
    recipientUid: 'bob',
    status: 'pending',
    requesterInfo: { displayName: 'Alice', username: 'alice', photoURL: null },
    recipientInfo: { displayName: 'Bob', username: 'bob', photoURL: null },
    createdAt: serverTimestamp(),
  }));

  console.log('Pending request created. Testing contact create...');
  await assertSucceeds(setDoc(doc(bob, 'contacts', 'alice__bob'), {
    members: ['alice', 'bob'],
    requesterUid: 'alice',
    recipientUid: 'bob',
    requesterInfo: { displayName: 'Alice', username: 'alice', photoURL: null },
    recipientInfo: { displayName: 'Bob', username: 'bob', photoURL: null },
    acceptedAt: serverTimestamp(),
  }));
  console.log('CONTACT CREATE PASSED');
} finally {
  await env.cleanup();
}
