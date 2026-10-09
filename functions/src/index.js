import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

async function sendToUser(uid, notification, data) {
  const userSnap = await db.collection('users').doc(uid).get();
  const tokens = userSnap.data()?.fcmTokens ?? [];
  if (tokens.length === 0) return;

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification,
    data: data ?? {},
  });

  const invalidTokens = response.responses
    .map((r, i) => (r.success ? null : tokens[i]))
    .filter(Boolean);
  if (invalidTokens.length > 0) {
    await db.collection('users').doc(uid).update({
      fcmTokens: tokens.filter((t) => !invalidTokens.includes(t)),
    });
  }
}

function notificationBodyFor(message, fallbackLabel) {
  if (message.encrypted) return `🔒 ${fallbackLabel}`;
  if (message.attachment) return `📎 ${message.attachment.name}`;
  return message.text;
}

export const onNewDirectMessage = onDocumentCreated('chats/{chatId}/messages/{messageId}', async (event) => {
  const message = event.data.data();
  const chatSnap = await db.collection('chats').doc(event.params.chatId).get();
  const participants = chatSnap.data()?.participants ?? [];
  const recipientUid = participants.find((uid) => uid !== message.senderId);
  if (!recipientUid) return;

  const senderName = chatSnap.data()?.participantInfo?.[message.senderId]?.displayName ?? 'Someone';
  await sendToUser(
    recipientUid,
    { title: senderName, body: notificationBodyFor(message, 'Sent you a message') },
    { path: `/chat/${event.params.chatId}` }
  );
});

export const onNewGroupMessage = onDocumentCreated('groups/{groupId}/messages/{messageId}', async (event) => {
  const message = event.data.data();
  const groupSnap = await db.collection('groups').doc(event.params.groupId).get();
  const group = groupSnap.data();
  if (!group) return;

  const senderName = group.memberInfo?.[message.senderId]?.displayName ?? 'Someone';
  const recipients = group.members.filter((uid) => uid !== message.senderId);
  const body = message.encrypted
    ? `🔒 ${senderName} sent a message`
    : `${senderName}: ${notificationBodyFor(message, '')}`;

  await Promise.all(
    recipients.map((uid) =>
      sendToUser(uid, { title: group.name, body }, { path: `/groups/${event.params.groupId}` })
    )
  );
});

export const onIncomingCall = onDocumentCreated('calls/{callId}', async (event) => {
  const call = event.data.data();
  await sendToUser(
    call.calleeUid,
    { title: `Incoming ${call.type} call`, body: `${call.callerName} is calling you` },
    { path: `/call/${event.params.callId}?role=callee` }
  );
});

export const onNewMeetingInvite = onDocumentCreated('meetings/{meetingCode}', async (event) => {
  const meeting = event.data.data();
  if (!meeting.groupId) return;

  const groupSnap = await db.collection('groups').doc(meeting.groupId).get();
  const group = groupSnap.data();
  if (!group) return;

  const recipients = group.members.filter((uid) => uid !== meeting.hostUid);
  const hostName = group.memberInfo?.[meeting.hostUid]?.displayName ?? 'Someone';

  await Promise.all(
    recipients.map((uid) =>
      sendToUser(
        uid,
        { title: `${hostName} started a meeting`, body: `${meeting.title} — tap to join` },
        { path: `/meeting/${event.params.meetingCode}/lobby` }
      )
    )
  );
});