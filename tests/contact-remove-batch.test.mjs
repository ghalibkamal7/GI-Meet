import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  writeBatch,
} from 'firebase/firestore';

const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'gi-meet-remove-batch',
  firestore: { rules },
});

try {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();

  const contactRef = doc(alice, 'contacts', 'alice__bob');
  const chatRef = doc(alice, 'chats', 'alice__bob');
  const messageRef = doc(alice, 'chats', 'alice__bob', 'messages', 'message-1');
  const markerRef = doc(alice, 'users', 'alice', 'removedContacts', 'bob');

  // Seed valid fixtures with rules disabled.
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'contacts', 'alice__bob'), {
      members: ['alice', 'bob'],
      requesterUid: 'alice',
      recipientUid: 'bob',
      requesterInfo: { displayName: 'Alice', username: 'alice', photoURL: null },
      recipientInfo: { displayName: 'Bob', username: 'bob', photoURL: null },
      acceptedAt: Date.now(),
    });
    await setDoc(doc(db, 'chats', 'alice__bob'), {
      participants: ['alice', 'bob'],
      participantInfo: {},
      lastMessageAt: Date.now(),
    });
    await setDoc(doc(db, 'chats', 'alice__bob', 'messages', 'message-1'), {
      senderId: 'alice',
      text: 'History must remain',
    });
  });

  // Simulate the same atomic batch used by removeAcceptedContact().
  const batch = writeBatch(alice);
  batch.delete(contactRef);
  batch.set(markerRef, { removedAt: Date.now() });
  await assertSucceeds(batch.commit());

  const [contact, marker, chat, message] = await Promise.all([
    getDoc(contactRef),
    getDoc(markerRef),
    getDoc(chatRef),
    getDoc(messageRef),
  ]);

  if (contact.exists()) throw new Error('Contact relationship should be deleted.');
  if (!marker.exists()) throw new Error('Private removal marker should exist.');
  if (!chat.exists()) throw new Error('Chat must remain.');
  if (!message.exists()) throw new Error('Message history must remain.');

  // Another user must not read Alice's private removal marker.
  await assertFails(getDoc(doc(bob, 'users', 'alice', 'removedContacts', 'bob')));

  console.log('ATOMIC CONTACT REMOVAL PASSED');
  console.log('CHAT AND MESSAGE PRESERVATION PASSED');
  console.log('PRIVATE REMOVAL MARKER ISOLATION PASSED');
} finally {
  await env.cleanup();
}
