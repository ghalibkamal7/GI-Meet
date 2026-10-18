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
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  setDoc,
  updateDoc,
  where,
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

async function seedFixtures() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
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
  });
}

try {
  await seedFixtures();

  console.log('Direct chats: only the sender can change message content');
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
  console.log('Allow attendee self-join');
  await assertSucceeds(updateDoc(doc(bob, 'meetings/active-room'), {
    activeParticipants: arrayUnion('bob'),
    allParticipants: arrayUnion('bob'),
    startedAt: new Date(),
  }));
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
  await assertFails(updateDoc(doc(bob, 'meetings/waiting-room'), {
    waitingParticipants: arrayUnion('mallory'),
    allParticipants: arrayUnion('mallory'),
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

  console.log('ALL FIRESTORE SECURITY TESTS PASSED');
} finally {
  await env.cleanup();
}
