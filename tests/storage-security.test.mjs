import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

const [firestoreRules, storageRules] = await Promise.all([
  readFile('firestore.rules', 'utf8'),
  readFile('storage.rules', 'utf8'),
]);
const env = await initializeTestEnvironment({
  projectId: 'demo-gi-meet-security',
  firestore: { rules: firestoreRules },
  storage: { rules: storageRules },
});

const aliceStorage = env.authenticatedContext('alice').storage();
const bobStorage = env.authenticatedContext('bob').storage();
const carolStorage = env.authenticatedContext('carol').storage();
const outsiderStorage = env.authenticatedContext('mallory').storage();
const unauthenticatedStorage = env.unauthenticatedContext().storage();

async function seedFixtures() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'chats', 'alice_bob'), { participants: ['alice', 'bob'] });
    await setDoc(doc(db, 'groups', 'team'), { members: ['alice', 'bob'] });
    await setDoc(doc(db, 'spots', 'alice-spot'), { uid: 'alice' });
    await setDoc(doc(db, 'spotFeeds', 'bob', 'items', 'alice-spot'), {
      ownerUid: 'alice',
      groupId: 'team',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await setDoc(doc(db, 'spotFeeds', 'mallory', 'items', 'alice-spot'), {
      ownerUid: 'alice',
      groupId: 'missing-group',
      expiresAt: new Date(Date.now() + 60_000),
    });
  });
}

try {
  await seedFixtures();
  const payload = new Uint8Array([1, 2, 3, 4]);

  console.log('Chat object access: participants can read/write; outsiders cannot');
  await assertSucceeds(uploadBytes(ref(aliceStorage, 'chats/alice_bob/alice.bin'), payload, {
    contentType: 'application/octet-stream',
  }));
  await assertSucceeds(getBytes(ref(bobStorage, 'chats/alice_bob/alice.bin')));
  await assertFails(getBytes(ref(outsiderStorage, 'chats/alice_bob/alice.bin')));
  await assertFails(getBytes(ref(unauthenticatedStorage, 'chats/alice_bob/alice.bin')));
  await assertFails(uploadBytes(ref(outsiderStorage, 'chats/alice_bob/outsider.bin'), payload, {
    contentType: 'application/octet-stream',
  }));
  await assertFails(uploadBytes(ref(aliceStorage, 'chats/missing_chat/file.bin'), payload, {
    contentType: 'application/octet-stream',
  }));
  await assertFails(uploadBytes(ref(unauthenticatedStorage, 'chats/alice_bob/unauth.bin'), payload, {
    contentType: 'application/octet-stream',
  }));
  await assertFails(uploadBytes(ref(bobStorage, 'chats/alice_bob/plain.txt'), payload, {
    contentType: 'text/plain',
  }));
  await assertSucceeds(uploadBytes(ref(aliceStorage, 'chats/alice_bob/legacy.bin'), payload, {
    contentType: 'application/octet-stream',
  }));
  const legacyDownloadUrl = await getDownloadURL(ref(aliceStorage, 'chats/alice_bob/legacy.bin'));
  await assertSucceeds(getBytes(ref(bobStorage, legacyDownloadUrl)));
  await assertFails(getBytes(ref(outsiderStorage, legacyDownloadUrl)));
  await assertFails(deleteObject(ref(outsiderStorage, 'chats/alice_bob/alice.bin')));
  await assertSucceeds(deleteObject(ref(bobStorage, 'chats/alice_bob/alice.bin')));
  await assertFails(uploadBytes(
    ref(aliceStorage, 'chats/alice_bob/oversize.bin'),
    new Uint8Array(50 * 1024 * 1024 + 17),
    { contentType: 'application/octet-stream' }
  ));

  console.log('Group object access: current members can read/write; non-members cannot');
  await assertSucceeds(uploadBytes(ref(aliceStorage, 'groups/team/group.bin'), payload, {
    contentType: 'application/octet-stream',
  }));
  await assertSucceeds(getBytes(ref(bobStorage, 'groups/team/group.bin')));
  await assertFails(getBytes(ref(carolStorage, 'groups/team/group.bin')));
  await assertFails(uploadBytes(ref(carolStorage, 'groups/team/outsider.bin'), payload, {
    contentType: 'application/octet-stream',
  }));
  console.log('Spot media: author and validated feed recipient can read; outsider cannot');
  await assertSucceeds(uploadBytes(ref(aliceStorage, 'spots/alice/alice-spot/photo.png'), payload, {
    contentType: 'image/png',
  }));
  await assertSucceeds(getBytes(ref(bobStorage, 'spots/alice/alice-spot/photo.png')));
  await assertFails(getBytes(ref(outsiderStorage, 'spots/alice/alice-spot/photo.png')));
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'groups/team'), { members: ['alice'] });
  });
  await assertFails(getBytes(ref(bobStorage, 'groups/team/group.bin')));
  await assertFails(getBytes(ref(bobStorage, 'spots/alice/alice-spot/photo.png')));
  await assertFails(uploadBytes(ref(aliceStorage, 'spots/alice/alice-spot/not-media.bin'), payload, {
    contentType: 'application/octet-stream',
  }));

  console.log('ALL STORAGE SECURITY TESTS PASSED');
} finally {
  await env.cleanup();
}
