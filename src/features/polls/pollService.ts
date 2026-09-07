import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';

export interface Poll {
  id: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  votes: Record<string, number[]>; // uid -> option indices they voted for
  closed: boolean;
  createdBy: string;
  createdAt: number;
}

/** parentType/parentId identify where this poll lives, e.g. ('groups', groupId) or ('meetings', code). */
function pollsCollection(parentType: 'chats' | 'groups' | 'meetings' | 'rooms', parentId: string) {
  return collection(db, parentType, parentId, 'polls');
}

export async function createPoll(
  parentType: 'chats' | 'groups' | 'meetings' | 'rooms',
  parentId: string,
  params: { question: string; options: string[]; allowMultiple: boolean; createdBy: string }
): Promise<string> {
  const docRef = await addDoc(pollsCollection(parentType, parentId), {
    question: params.question.trim(),
    options: params.options.map((o) => o.trim()).filter(Boolean),
    allowMultiple: params.allowMultiple,
    votes: {},
    closed: false,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export function subscribeToPolls(
  parentType: 'chats' | 'groups' | 'meetings' | 'rooms',
  parentId: string,
  callback: (polls: Poll[]) => void
): Unsubscribe {
  return onSnapshot(pollsCollection(parentType, parentId), (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          question: data.question,
          options: data.options ?? [],
          allowMultiple: Boolean(data.allowMultiple),
          votes: data.votes ?? {},
          closed: Boolean(data.closed),
          createdBy: data.createdBy,
          createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        };
      })
    );
  });
}

export async function votePoll(
  parentType: 'chats' | 'groups' | 'meetings' | 'rooms',
  parentId: string,
  pollId: string,
  uid: string,
  optionIndices: number[]
): Promise<void> {
  await updateDoc(doc(pollsCollection(parentType, parentId), pollId), {
    [`votes.${uid}`]: optionIndices,
  });
}

export async function closePoll(
  parentType: 'chats' | 'groups' | 'meetings' | 'rooms',
  parentId: string,
  pollId: string
): Promise<void> {
  await updateDoc(doc(pollsCollection(parentType, parentId), pollId), { closed: true });
}
