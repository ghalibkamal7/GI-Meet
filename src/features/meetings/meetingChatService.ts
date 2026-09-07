import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';

export interface MeetingChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}

export function subscribeToMeetingChat(meetingCode: string, callback: (messages: MeetingChatMessage[]) => void): Unsubscribe {
  const q = query(collection(db, 'meetings', meetingCode, 'chat'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderId: data.senderId,
          senderName: data.senderName,
          text: data.text,
          createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        };
      })
    );
  });
}

export async function sendMeetingChatMessage(meetingCode: string, senderId: string, senderName: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await addDoc(collection(db, 'meetings', meetingCode, 'chat'), {
    senderId,
    senderName,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
}
