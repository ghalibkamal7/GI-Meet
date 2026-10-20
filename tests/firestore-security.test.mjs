import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'gi-meet-firestore-security',
  firestore: { rules },
});

const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const carol = env.authenticatedContext('carol').firestore();
const outsider = env.authenticatedContext('mallory').firestore();
const unauthenticated = env.unauthenticatedContext().firestore();
const seededSpotExpiresAt = new Date(Date.now() + 60_000);

async function seedFixtures() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'alice'), { uid: 'alice', username: 'alice' });
    await setDoc(doc(db, 'users', 'bob'), { uid: 'bob', username: 'bob', publicKeyJwk: null });
    await setDoc(doc(db, 'chats', 'alice_bob'), {
      participants: ['alice', 'bob'],
      participantInfo: {},
      lastMessage: '',
      lastMessageAt: 1,
      lastMessageSenderId: '',
      typing: {},
      lastReadAt: {},
      pinnedMessageIds: [],
      mutedBy: [],
      archivedBy: [],
      hiddenFor: [],
    });
    await setDoc(doc(db, 'chats', 'page-chat'), {
      participants: ['alice', 'bob'],
      participantInfo: {},
      lastMessage: '',
      lastMessageAt: 1,
      lastMessageSenderId: '',
    });
    await setDoc(doc(db, 'chats', 'alice_bob', 'messages', 'alice-message'), {
      chatId: 'alice_bob',
      senderId: 'alice',
      text: 'Original',
      createdAt: 1,
      readBy: ['alice'],
      starredBy: [],
      reactions: {},
      reactionUsers: {},
      deleted: false,
      encrypted: false,
      iv: null,
      attachment: null,
    });
    await Promise.all(Array.from({ length: 65 }, (_, index) => setDoc(
      doc(db, 'chats', 'page-chat', 'messages', `page-${String(index + 1).padStart(2, '0')}`),
      {
        chatId: 'alice_bob',
        senderId: 'alice',
        text: `Message ${index + 1}`,
        createdAt: index + 1,
        readBy: ['alice'],
        starredBy: [],
        reactions: {},
        reactionUsers: {},
        deleted: false,
        encrypted: false,
        iv: null,
        attachment: null,
      }
    )));
    await setDoc(doc(db, 'groups', 'team'), {
      name: 'Team',
      description: '',
      members: ['alice', 'bob', 'carol'],
      admins: ['alice', 'carol'],
      coAdmins: ['carol'],
      memberInfo: {},
      createdBy: 'alice',
      mutedBy: [],
      pinnedMessageIds: [],
      lastReadAt: {},
      lastMessage: '',
      lastMessageAt: 1,
      lastMessageSenderId: '',
      communityId: null,
      isRoom: false,
    });
    await setDoc(doc(db, 'groups', 'team', 'messages', 'alice-message'), {
      chatId: 'team',
      senderId: 'alice',
      text: 'Original group message',
      createdAt: 1,
      readBy: ['alice'],
      starredBy: [],
      reactions: {},
      reactionUsers: {},
      deleted: false,
      encrypted: false,
      iv: null,
      attachment: null,
    });
    await setDoc(doc(db, 'meetings', 'active-room'), {
      hostUid: 'alice',
      coHosts: ['carol'],
      locked: false,
      waitingRoomEnabled: false,
      activeParticipants: ['alice', 'carol'],
      waitingParticipants: [],
      allParticipants: ['alice', 'carol'],
      startedAt: null,
      endedAt: null,
    });
    await setDoc(doc(db, 'meetings', 'waiting-room'), {
      hostUid: 'alice',
      coHosts: [],
      locked: false,
      waitingRoomEnabled: true,
      activeParticipants: ['alice'],
      waitingParticipants: [],
      allParticipants: ['alice'],
      startedAt: null,
      endedAt: null,
    });
    await setDoc(doc(db, 'meetings', 'password-protected-room'), {
      hostUid: 'alice',
      coHosts: [],
      locked: false,
      hasPassword: true,
      waitingRoomEnabled: false,
      activeParticipants: ['alice'],
      waitingParticipants: [],
      allParticipants: ['alice'],
      invitedUids: ['bob'],
      startedAt: null,
      endedAt: null,
    });
    await setDoc(doc(db, 'meetings', 'legacy-password-room'), {
      hostUid: 'alice',
      coHosts: [],
      locked: false,
      passwordHash: 'a'.repeat(64),
      waitingRoomEnabled: false,
      activeParticipants: ['alice'],
      waitingParticipants: [],
      allParticipants: ['alice'],
      startedAt: null,
      endedAt: null,
    });
    await setDoc(doc(db, 'meetings', 'password-protected-room', 'passwordAuthorizations', 'bob'), {
      expiresAt: seededSpotExpiresAt,
    });
    await setDoc(doc(db, 'meetings', 'password-protected-room', 'passwordAuthorizations', 'carol'), {
      expiresAt: new Date(Date.now() - 60_000),
    });
    await setDoc(doc(db, 'meetings', 'password-protected-room', 'chat', 'message'), {
      senderId: 'alice',
      text: 'Protected meeting message',
    });
    await setDoc(doc(db, 'meetings', 'attendee-leave-active'), {
      hostUid: 'alice',
      coHosts: ['carol'],
      locked: false,
      waitingRoomEnabled: false,
      activeParticipants: ['alice', 'bob', 'carol', 'mallory'],
      waitingParticipants: [],
      allParticipants: ['alice', 'bob', 'carol', 'mallory'],
      startedAt: null,
      endedAt: null,
    });
    await setDoc(doc(db, 'meetings', 'attendee-leave-waiting'), {
      hostUid: 'alice',
      coHosts: ['carol'],
      locked: false,
      waitingRoomEnabled: true,
      activeParticipants: ['alice', 'carol'],
      waitingParticipants: ['bob', 'mallory'],
      allParticipants: ['alice', 'bob', 'carol', 'mallory'],
      startedAt: null,
      endedAt: null,
    });
    await setDoc(doc(db, 'meetings', 'active-room', 'qna', 'question'), {
      text: 'Question',
      askedBy: 'bob',
      upvotes: [],
      answered: false,
    });
    await setDoc(doc(db, 'meetings', 'waiting-room', 'chat', 'message'), {
      senderId: 'alice',
      text: 'Waiting-room chat',
    });
    await setDoc(doc(db, 'meetings', 'active-room', 'polls', 'meeting-poll'), {
      question: 'Meeting poll',
      options: ['Yes', 'No'],
      votes: {},
      closed: false,
      createdBy: 'bob',
    });
    await setDoc(doc(db, 'communities', 'public-community'), {
      name: 'Public',
      isPublic: true,
      createdBy: 'alice',
      admins: ['alice'],
      members: ['alice', 'bob'],
      memberInfo: { bob: { displayName: 'Bob', photoURL: null } },
      groupIds: [],
    });
    await setDoc(doc(db, 'communities', 'private-community'), {
      name: 'Private',
      isPublic: false,
      createdBy: 'alice',
      admins: ['alice'],
      members: ['alice'],
      memberInfo: {},
      groupIds: [],
    });
    await setDoc(doc(db, 'spots', 'alice-spot'), {
      uid: 'alice',
      authorName: 'Alice',
      text: 'A private test spot',
      mediaUrl: null,
      expiresAt: seededSpotExpiresAt,
      viewedBy: [],
      reactions: {},
      audienceUids: ['bob', 'carol'],
    });
    await setDoc(doc(db, 'spotFeeds', 'bob', 'items', 'alice-spot'), {
      ownerUid: 'alice',
      chatId: 'alice_bob',
      expiresAt: seededSpotExpiresAt,
    });
    await setDoc(doc(db, 'spots', 'alice-spot', 'audience', 'bob'), {
      ownerUid: 'alice',
      chatId: 'alice_bob',
      expiresAt: seededSpotExpiresAt,
    });
    await setDoc(doc(db, 'spotFeeds', 'carol', 'items', 'alice-spot'), {
      ownerUid: 'alice',
      groupId: 'team',
      expiresAt: new Date(Date.now() + 60_000),
    });
  });
}

try {
  await seedFixtures();

  console.log('Account encryption keys: first registration is allowed, replacement and removal are denied');
  const aliceUserRef = doc(alice, 'users/alice');
  const candidateKeyA = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'candidate-a', y: 'candidate-a' });
  const candidateKeyB = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'candidate-b', y: 'candidate-b' });
  await assertSucceeds(updateDoc(aliceUserRef, { publicKeyJwk: candidateKeyA }));
  await assertFails(updateDoc(aliceUserRef, { publicKeyJwk: candidateKeyB }));
  await assertFails(updateDoc(aliceUserRef, { publicKeyJwk: deleteField() }));
  await assertSucceeds(updateDoc(aliceUserRef, { publicKeyJwk: candidateKeyA }));
  await assertSucceeds(updateDoc(aliceUserRef, { displayName: 'Alice Updated' }));
  await assertSucceeds(updateDoc(doc(bob, 'users/bob'), { publicKeyJwk: candidateKeyA }));
  await assertFails(updateDoc(doc(bob, 'users/bob'), { publicKeyJwk: candidateKeyB }));

  console.log('Direct chats: only the sender can change message content');
  const messagePayload = {
    chatId: 'alice_bob',
    senderId: 'alice',
    text: 'ciphertext-placeholder',
    createdAt: 2,
    editedAt: null,
    readBy: ['alice'],
    replyTo: null,
    forwardedFrom: null,
    deleted: false,
    attachment: null,
    reactions: {},
    reactionUsers: {},
    starredBy: [],
    encrypted: true,
    iv: 'AA==',
  };
  const memberSend = writeBatch(alice);
  memberSend.set(doc(alice, 'chats/alice_bob/messages/alice-send'), messagePayload);
  memberSend.update(doc(alice, 'chats/alice_bob'), {
    lastMessage: '🔒 Encrypted message',
    lastMessageCipher: 'ciphertext-placeholder',
    lastMessageIv: 'AA==',
    lastMessageAt: 2,
    lastMessageSenderId: 'alice',
    hiddenFor: [],
  });
  await assertSucceeds(memberSend.commit());

  console.log('Direct chats: message creation succeeds, and the same sender can repeat a preview');
  await assertSucceeds(setDoc(doc(alice, 'chats/alice_bob/messages/alice-repeat-send'), {
    ...messagePayload,
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(alice, 'chats/alice_bob'), {
    lastMessage: '🔒 Encrypted message',
    lastMessageCipher: 'ciphertext-placeholder',
    lastMessageIv: 'AA==',
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: 'alice',
    hiddenFor: [],
  }));
  const repeatedSend = writeBatch(alice);
  repeatedSend.set(doc(alice, 'chats/alice_bob/messages/alice-repeat-batch'), {
    ...messagePayload,
    createdAt: serverTimestamp(),
  });
  repeatedSend.update(doc(alice, 'chats/alice_bob'), {
    lastMessage: '🔒 Encrypted message',
    lastMessageCipher: 'ciphertext-placeholder',
    lastMessageIv: 'AA==',
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: 'alice',
    hiddenFor: [],
  });
  await assertSucceeds(repeatedSend.commit());
  const bobSend = writeBatch(bob);
  bobSend.set(doc(bob, 'chats/alice_bob/messages/bob-send'), {
    ...messagePayload,
    senderId: 'bob',
    readBy: ['bob'],
    createdAt: serverTimestamp(),
  });
  bobSend.update(doc(bob, 'chats/alice_bob'), {
    lastMessage: 'Bob message',
    lastMessageCipher: 'bob-ciphertext',
    lastMessageIv: 'BB==',
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: 'bob',
    hiddenFor: [],
  });
  await assertSucceeds(bobSend.commit());
  const chatAfterBobSend = (await getDoc(doc(bob, 'chats/alice_bob'))).data();
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob'), {
    lastMessage: 'Missing timestamp update',
    lastMessageSenderId: 'bob',
  }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob'), {
    lastMessage: 'Unchanged timestamp update',
    lastMessageAt: chatAfterBobSend.lastMessageAt,
    lastMessageSenderId: 'bob',
  }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob'), {
    lastMessage: 'Spoofed sender',
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: 'alice',
  }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob'), {
    lastMessage: 'Unauthorized field update',
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: 'bob',
    participants: ['alice', 'bob', 'mallory'],
  }));
  await assertFails(updateDoc(doc(outsider, 'chats/alice_bob'), {
    lastMessage: 'Unauthorized participant update',
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: 'mallory',
  }));

  const outsiderSend = writeBatch(outsider);
  outsiderSend.set(doc(outsider, 'chats/alice_bob/messages/outsider-send'), {
    ...messagePayload,
    senderId: 'mallory',
  });
  outsiderSend.update(doc(outsider, 'chats/alice_bob'), {
    lastMessage: 'Unauthorized',
    lastMessageAt: 3,
    lastMessageSenderId: 'mallory',
  });
  await assertFails(outsiderSend.commit());
  const rejectedMessage = await assertSucceeds(getDoc(doc(alice, 'chats/alice_bob/messages/outsider-send')));
  if (rejectedMessage.exists()) throw new Error('Rejected batch left an unauthorized message behind.');

  await assertSucceeds(updateDoc(doc(alice, 'chats/alice_bob/messages/alice-message'), { text: 'Edited by Alice' }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob/messages/alice-message'), { text: 'Changed by Bob' }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob/messages/alice-message'), { senderId: 'bob' }));
  await assertSucceeds(updateDoc(doc(bob, 'chats/alice_bob/messages/alice-message'), {
    'reactionUsers.bob': ['👍'],
  }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob/messages/alice-message'), {
    'reactionUsers.mallory': ['👍'],
  }));
  await assertSucceeds(updateDoc(doc(bob, 'chats/alice_bob/messages/alice-message'), {
    readBy: arrayUnion('bob'),
  }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob/messages/alice-message'), {
    readBy: arrayUnion('mallory'),
  }));
  await assertSucceeds(updateDoc(doc(bob, 'chats/alice_bob/messages/alice-message'), {
    starredBy: arrayUnion('bob'),
  }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob/messages/alice-message'), {
    starredBy: arrayUnion('mallory'),
  }));
  await assertFails(updateDoc(doc(bob, 'chats/alice_bob'), { participants: arrayUnion('mallory') }));

  console.log('Message pagination: pages remain chronological, complete, and non-overlapping');
  const messageCollection = collection(alice, 'chats/page-chat/messages');
  const firstPage = await assertSucceeds(getDocs(query(
    messageCollection,
    orderBy('createdAt', 'desc'),
    limit(30)
  )));
  const secondPage = await assertSucceeds(getDocs(query(
    messageCollection,
    orderBy('createdAt', 'desc'),
    startAfter(firstPage.docs[firstPage.docs.length - 1]),
    limit(30)
  )));
  const thirdPage = await assertSucceeds(getDocs(query(
    messageCollection,
    orderBy('createdAt', 'desc'),
    startAfter(secondPage.docs[secondPage.docs.length - 1]),
    limit(30)
  )));
  const chronologicalPages = [
    ...thirdPage.docs.map((message) => message.data().createdAt).reverse(),
    ...secondPage.docs.map((message) => message.data().createdAt).reverse(),
    ...firstPage.docs.map((message) => message.data().createdAt).reverse(),
  ];
  if (chronologicalPages.length !== 65 || new Set(chronologicalPages).size !== 65) {
    throw new Error(`Expected 65 unique paged messages, got ${chronologicalPages.length}.`);
  }
  if (chronologicalPages.some((createdAt, index) => index > 0 && chronologicalPages[index - 1] >= createdAt)) {
    throw new Error('Message pages were not returned in chronological order.');
  }

  console.log('Groups: member-owned updates and manager-only membership controls');
  await assertSucceeds(updateDoc(doc(alice, 'groups/team/messages/alice-message'), { text: 'Edited by Alice' }));
  await assertFails(updateDoc(doc(bob, 'groups/team/messages/alice-message'), { text: 'Changed by Bob' }));
  await assertSucceeds(updateDoc(doc(bob, 'groups/team/messages/alice-message'), {
    'reactionUsers.bob': ['❤️'],
  }));
  await assertFails(updateDoc(doc(bob, 'groups/team/messages/alice-message'), {
    'reactionUsers.mallory': ['❤️'],
  }));
  await assertFails(updateDoc(doc(bob, 'groups/team'), { members: arrayUnion('mallory') }));
  await assertFails(updateDoc(doc(bob, 'groups/team'), { admins: arrayUnion('bob') }));
  await assertSucceeds(updateDoc(doc(alice, 'groups/team'), {
    members: arrayUnion('mallory'),
    'memberInfo.mallory': { displayName: 'Mallory', photoURL: null },
  }));
  await assertSucceeds(updateDoc(doc(alice, 'groups/team'), { admins: arrayUnion('bob') }));
  await assertSucceeds(updateDoc(doc(alice, 'groups/team'), { coAdmins: arrayUnion('bob') }));
  await assertSucceeds(updateDoc(doc(alice, 'groups/team'), { coAdmins: arrayRemove('bob') }));
  await assertSucceeds(updateDoc(doc(bob, 'groups/team'), {
    members: arrayRemove('bob'),
    admins: arrayRemove('bob'),
    coAdmins: arrayRemove('bob'),
  }));
  await assertSucceeds(updateDoc(doc(alice, 'groups/team'), {
    members: arrayRemove('carol'),
    admins: arrayRemove('carol'),
    coAdmins: arrayRemove('carol'),
  }));
  await assertSucceeds(updateDoc(doc(alice, 'groups/team'), { name: 'Renamed team' }));
  await assertFails(updateDoc(doc(bob, 'groups/team'), { name: 'Unauthorized rename' }));

  console.log('Meetings: participants can join/leave; host controls remain privileged');
  console.log('Meeting reads: only participants and invitees can read meeting records, and legacy hashes stay server-only');
  await assertSucceeds(getDoc(doc(alice, 'meetings/active-room')));
  await assertFails(getDoc(doc(outsider, 'meetings/active-room')));
  await assertSucceeds(getDoc(doc(bob, 'meetings/password-protected-room')));
  await assertFails(getDoc(doc(outsider, 'meetings/password-protected-room')));
  await assertFails(getDoc(doc(alice, 'meetings/legacy-password-room')));
  await assertFails(getDoc(doc(bob, 'meetings/password-protected-room/chat/message')));
  await assertFails(getDoc(doc(outsider, 'meetings/active-room/qna/question')));
  await assertFails(getDoc(doc(outsider, 'meetings/active-room/polls/meeting-poll')));
  await assertSucceeds(getDoc(doc(alice, 'meetings/password-protected-room/chat/message')));
  console.log('Allow attendee self-join');
  await assertSucceeds(updateDoc(doc(bob, 'meetings/active-room'), {
    activeParticipants: arrayUnion('bob'),
    allParticipants: arrayUnion('bob'),
    startedAt: new Date(),
  }));
  await assertSucceeds(getDoc(doc(bob, 'meetings/active-room')));
  await assertSucceeds(getDoc(doc(bob, 'meetings/active-room/qna/question')));
  console.log('Deny attendee adding another participant');
  await assertFails(updateDoc(doc(carol, 'meetings/active-room'), {
    activeParticipants: arrayUnion('mallory'),
    allParticipants: arrayUnion('mallory'),
  }));
  console.log('Deny attendee metadata edits');
  await assertFails(updateDoc(doc(bob, 'meetings/active-room'), { title: 'Unauthorized title' }));
  console.log('Deny attendee lock');
  await assertFails(updateDoc(doc(bob, 'meetings/active-room'), { locked: true }));
  console.log('Allow co-host lock');
  await assertSucceeds(updateDoc(doc(carol, 'meetings/active-room'), { locked: true }));
  await assertFails(updateDoc(doc(carol, 'meetings/active-room'), { coHosts: arrayUnion('bob') }));
  await assertSucceeds(updateDoc(doc(alice, 'meetings/active-room'), { coHosts: arrayUnion('bob') }));
  await assertSucceeds(updateDoc(doc(bob, 'meetings/waiting-room'), {
    waitingParticipants: arrayUnion('bob'),
    allParticipants: arrayUnion('bob'),
  }));
  await assertFails(getDoc(doc(bob, 'meetings/waiting-room/chat/message')));
  await assertSucceeds(updateDoc(doc(alice, 'meetings/waiting-room'), {
    waitingParticipants: arrayRemove('bob'),
    activeParticipants: arrayUnion('bob'),
  }));
  await assertSucceeds(getDoc(doc(bob, 'meetings/waiting-room/chat/message')));
  await assertSucceeds(updateDoc(doc(bob, 'meetings/waiting-room'), {
    activeParticipants: arrayRemove('bob'),
  }));
  await assertFails(getDoc(doc(bob, 'meetings/waiting-room/chat/message')));
  await assertFails(updateDoc(doc(bob, 'meetings/waiting-room'), {
    waitingParticipants: arrayUnion('mallory'),
    allParticipants: arrayUnion('mallory'),
  }));
  console.log('Password-protected meetings require a live, server-issued authorization before joining');
  await assertFails(updateDoc(doc(bob, 'meetings/password-protected-room'), {
    activeParticipants: arrayUnion('bob'),
    allParticipants: arrayUnion('bob'),
    startedAt: new Date(),
  }));
  await assertFails(updateDoc(doc(bob, 'meetings/legacy-password-room'), {
    activeParticipants: arrayUnion('bob'),
    allParticipants: arrayUnion('bob'),
    startedAt: new Date(),
  }));
  await assertFails(setDoc(doc(bob, 'meetings/password-protected-room/passwordAuthorizations', 'mallory'), {
    expiresAt: new Date(Date.now() + 60_000),
  }));
  await assertFails(updateDoc(doc(carol, 'meetings/password-protected-room'), {
    activeParticipants: arrayUnion('carol'),
    allParticipants: arrayUnion('carol'),
    startedAt: new Date(),
  }));
  await assertFails(updateDoc(doc(bob, 'meetings/password-protected-room'), {
    activeParticipants: arrayUnion('bob'),
    allParticipants: arrayUnion('bob'),
    startedAt: new Date(),
  }));
  await assertSucceeds(updateDoc(doc(alice, 'meetings/password-protected-room'), {
    startedAt: new Date(),
  }));
  console.log('Attendee leave is limited to the authenticated UID in each participant array');
  await assertFails(updateDoc(doc(bob, 'meetings/attendee-leave-active'), {
    activeParticipants: arrayRemove('mallory'),
  }));
  await assertFails(updateDoc(doc(bob, 'meetings/attendee-leave-active'), {
    activeParticipants: arrayRemove('alice'),
  }));
  await assertFails(updateDoc(doc(bob, 'meetings/attendee-leave-active'), {
    activeParticipants: arrayRemove('carol'),
  }));
  await assertSucceeds(updateDoc(doc(bob, 'meetings/attendee-leave-active'), {
    activeParticipants: arrayRemove('bob'),
  }));
  await assertFails(updateDoc(doc(bob, 'meetings/attendee-leave-waiting'), {
    waitingParticipants: arrayRemove('mallory'),
  }));
  await assertSucceeds(updateDoc(doc(bob, 'meetings/attendee-leave-waiting'), {
    waitingParticipants: arrayRemove('bob'),
  }));
  console.log('Co-hosts retain participant-removal controls');
  await assertSucceeds(updateDoc(doc(carol, 'meetings/attendee-leave-active'), {
    activeParticipants: arrayRemove('mallory'),
  }));
  await assertSucceeds(updateDoc(doc(carol, 'meetings/attendee-leave-waiting'), {
    waitingParticipants: arrayRemove('mallory'),
  }));
  await assertSucceeds(updateDoc(doc(bob, 'meetings/active-room'), {
    activeParticipants: arrayRemove('bob'),
    waitingParticipants: arrayRemove('bob'),
  }));
  await assertFails(getDoc(doc(bob, 'meetings/active-room/qna/question')));

  console.log('Meeting Q&A and polls: self-updates are isolated; host moderation is allowed');
  await assertSucceeds(updateDoc(doc(alice, 'meetings/active-room/qna/question'), {
    upvotes: arrayUnion('alice'),
  }));
  await assertFails(updateDoc(doc(outsider, 'meetings/active-room/qna/question'), { answered: true }));
  await assertSucceeds(updateDoc(doc(alice, 'meetings/active-room/qna/question'), { answered: true }));
  await assertSucceeds(updateDoc(doc(alice, 'meetings/active-room/polls/meeting-poll'), {
    'votes.alice': [0],
  }));
  await assertFails(updateDoc(doc(alice, 'meetings/active-room/polls/meeting-poll'), {
    'votes.mallory': [0],
  }));

  console.log('Communities: public reads work; private reads and direct membership grants are denied');
  await assertSucceeds(getDoc(doc(bob, 'communities/public-community')));
  await assertFails(getDoc(doc(bob, 'communities/private-community')));
  await assertFails(setDoc(doc(bob, 'communities/forged-membership'), {
    createdBy: 'bob',
    members: ['bob', 'mallory'],
    admins: ['bob', 'mallory'],
    isPublic: true,
  }));
  await assertSucceeds(setDoc(doc(bob, 'communities/valid-new-community'), {
    createdBy: 'bob',
    members: ['bob'],
    admins: ['bob'],
    isPublic: true,
  }));
  await assertFails(updateDoc(doc(bob, 'communities/public-community'), {
    members: arrayUnion('mallory'),
    'memberInfo.mallory': { displayName: 'Mallory', photoURL: null },
  }));
  await assertFails(updateDoc(doc(bob, 'communities/public-community'), {
    admins: arrayUnion('bob'),
  }));
  await assertSucceeds(updateDoc(doc(alice, 'communities/public-community'), {
    name: 'Updated public community',
  }));
  await assertSucceeds(updateDoc(doc(alice, 'communities/public-community'), {
    admins: arrayUnion('bob'),
  }));
  await assertFails(updateDoc(doc(bob, 'communities/private-community'), {
    name: 'Unauthorized private edit',
  }));

  const publicList = await assertSucceeds(getDocs(query(
    collection(bob, 'communities'),
    where('isPublic', '==', true),
  )));
  if (publicList.size !== 2) throw new Error(`Expected two discoverable public communities, got ${publicList.size}.`);

  console.log('Spots: only authors and validated per-viewer feeds can read; feed relationships cannot be forged');
  console.log('Spot read as author');
  await assertSucceeds(getDoc(doc(alice, 'spots/alice-spot')));
  console.log('Spot read as active direct-chat contact');
  await assertSucceeds(getDoc(doc(bob, 'spots/alice-spot')));
  console.log('Spot read after shared-group membership removal is denied');
  await assertFails(getDoc(doc(carol, 'spots/alice-spot')));
  await assertFails(getDoc(doc(outsider, 'spots/alice-spot')));
  await assertFails(getDoc(doc(unauthenticated, 'spots/alice-spot')));
  await assertFails(getDocs(query(collection(bob, 'spots'), where('uid', '==', 'alice'))));
  await assertSucceeds(getDoc(doc(bob, 'spotFeeds/bob/items/alice-spot')));
  await assertFails(getDoc(doc(outsider, 'spotFeeds/bob/items/alice-spot')));
  await assertSucceeds(getDoc(doc(alice, 'spots/alice-spot/audience/bob')));
  await assertFails(getDoc(doc(bob, 'spots/alice-spot/audience/bob')));
  const newSpot = doc(alice, 'spots/alice-new-spot');
  const newFeed = doc(alice, 'spotFeeds/bob/items/alice-new-spot');
  const newAudienceEntry = doc(alice, 'spots/alice-new-spot/audience/bob');
  const newSpotExpiresAt = new Date(Date.now() + 60_000);
  const feedBatch = writeBatch(alice);
  feedBatch.set(newSpot, {
    uid: 'alice',
    authorName: 'Alice',
    mediaUrl: null,
    text: 'New spot',
    expiresAt: newSpotExpiresAt,
    viewedBy: [],
    reactions: {},
  });
  feedBatch.set(newFeed, {
    ownerUid: 'alice',
    chatId: 'alice_bob',
    expiresAt: newSpotExpiresAt,
  });
  feedBatch.set(newAudienceEntry, {
    ownerUid: 'alice',
    chatId: 'alice_bob',
    expiresAt: newSpotExpiresAt,
  });
  await assertSucceeds(feedBatch.commit());
  await assertSucceeds(getDoc(doc(bob, 'spots/alice-new-spot')));
  await assertSucceeds(getDoc(newAudienceEntry));
  await assertFails(getDoc(doc(bob, 'spots/alice-new-spot/audience/bob')));
  const deleteSpotBatch = writeBatch(alice);
  deleteSpotBatch.delete(newFeed);
  deleteSpotBatch.delete(newAudienceEntry);
  deleteSpotBatch.delete(newSpot);
  await assertSucceeds(deleteSpotBatch.commit());
  await assertFails(getDoc(doc(bob, 'spots/alice-new-spot')));
  await assertFails(setDoc(doc(bob, 'spotFeeds/mallory/items/alice-spot'), {
    ownerUid: 'bob',
    groupId: 'missing-group',
    expiresAt: new Date(Date.now() + 60_000),
  }));
  await assertFails(setDoc(doc(bob, 'spotFeeds/mallory/items/alice-spot'), {
    ownerUid: 'alice',
    chatId: 'alice_bob',
    expiresAt: seededSpotExpiresAt,
  }));
  await assertFails(setDoc(doc(alice, 'spotFeeds/mallory/items/alice-spot'), {
    ownerUid: 'alice',
    groupId: 'missing-group',
    expiresAt: seededSpotExpiresAt,
  }));
  await assertFails(setDoc(doc(alice, 'spots/alice-spot/audience/mallory'), {
    ownerUid: 'alice',
    groupId: 'missing-group',
    expiresAt: seededSpotExpiresAt,
  }));

  console.log('Spots: viewers can add their own view/reaction metadata but cannot alter content or other users');
  await assertSucceeds(updateDoc(doc(bob, 'spots/alice-spot'), {
    viewedBy: arrayUnion('bob'),
  }));
  await assertSucceeds(updateDoc(doc(bob, 'spots/alice-spot'), {
    'reactions.bob': '🔥',
  }));
  await assertFails(updateDoc(doc(bob, 'spots/alice-spot'), {
    text: 'Changed by Bob',
  }));
  await assertFails(updateDoc(doc(bob, 'spots/alice-spot'), {
    uid: 'bob',
  }));
  await assertFails(updateDoc(doc(bob, 'spots/alice-spot'), {
    viewedBy: arrayUnion('mallory'),
  }));
  await assertFails(updateDoc(doc(bob, 'spots/alice-spot'), {
    'reactions.alice': '🔥',
  }));

  console.log('ALL FIRESTORE SECURITY TESTS PASSED');
} finally {
  await env.cleanup();
}
