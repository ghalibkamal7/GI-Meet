import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';

export interface Question {
  id: string;
  text: string;
  askedBy: string;
  askedByName: string;
  upvotes: string[];
  answered: boolean;
  createdAt: number;
}

function qnaCollection(meetingCode: string) {
  return collection(db, 'meetings', meetingCode, 'qna');
}

export async function askQuestion(meetingCode: string, uid: string, name: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await addDoc(qnaCollection(meetingCode), {
    text: trimmed,
    askedBy: uid,
    askedByName: name,
    upvotes: [],
    answered: false,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToQuestions(meetingCode: string, callback: (questions: Question[]) => void): Unsubscribe {
  return onSnapshot(qnaCollection(meetingCode), (snap) => {
    const questions = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        text: data.text,
        askedBy: data.askedBy,
        askedByName: data.askedByName,
        upvotes: data.upvotes ?? [],
        answered: Boolean(data.answered),
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
      };
    });
    callback(questions.sort((a, b) => b.upvotes.length - a.upvotes.length));
  });
}

export async function toggleUpvote(meetingCode: string, questionId: string, uid: string, already: boolean): Promise<void> {
  await updateDoc(doc(qnaCollection(meetingCode), questionId), {
    upvotes: already ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function markAnswered(meetingCode: string, questionId: string, answered: boolean): Promise<void> {
  await updateDoc(doc(qnaCollection(meetingCode), questionId), { answered });
}
