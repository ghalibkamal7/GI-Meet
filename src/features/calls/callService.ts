import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';

export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
export type CallType = 'voice' | 'video';

export interface CallDoc {
  callerUid: string;
  calleeUid: string;
  callerName: string;
  calleeName: string;
  type: CallType;
  status: CallStatus;
  createdAt: number;
}

// STUN-only for MVP. For production reliability behind restrictive NATs/firewalls,
// add a TURN server (e.g. Twilio Network Traversal Service, or coturn you host)
// to this list — without TURN, some calls between users on strict networks will fail to connect.
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export async function createCall(params: {
  callerUid: string;
  calleeUid: string;
  callerName: string;
  calleeName: string;
  type: CallType;
}): Promise<string> {
  const docRef = await addDoc(collection(db, 'calls'), {
    ...params,
    status: 'ringing',
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export function subscribeToCall(callId: string, callback: (call: (CallDoc & { id: string }) | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'calls', callId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data();
    callback({
      id: snap.id,
      callerUid: data.callerUid,
      calleeUid: data.calleeUid,
      callerName: data.callerName,
      calleeName: data.calleeName,
      type: data.type,
      status: data.status,
      createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    });
  });
}

export async function updateCallStatus(callId: string, status: CallStatus): Promise<void> {
  await updateDoc(doc(db, 'calls', callId), { status });
}

export async function setOffer(callId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  await updateDoc(doc(db, 'calls', callId), { offer: { type: offer.type, sdp: offer.sdp } });
}

export async function setAnswer(callId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  await updateDoc(doc(db, 'calls', callId), { answer: { type: answer.type, sdp: answer.sdp } });
}

export function subscribeToRemoteDescription(
  callId: string,
  field: 'offer' | 'answer',
  callback: (desc: RTCSessionDescriptionInit) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'calls', callId), (snap) => {
    const data = snap.data();
    if (data?.[field]) callback(data[field]);
  });
}

export async function addIceCandidate(
  callId: string,
  role: 'caller' | 'callee',
  candidate: RTCIceCandidateInit
): Promise<void> {
  await addDoc(collection(db, 'calls', callId, `${role}Candidates`), candidate);
}

export function subscribeToIceCandidates(
  callId: string,
  role: 'caller' | 'callee',
  callback: (candidate: RTCIceCandidateInit) => void
): Unsubscribe {
  return onSnapshot(collection(db, 'calls', callId, `${role}Candidates`), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') callback(change.doc.data() as RTCIceCandidateInit);
    });
  });
}

export async function logCallHistory(params: {
  uid: string;
  otherUid: string;
  otherName: string;
  type: CallType;
  direction: 'incoming' | 'outgoing';
  outcome: 'completed' | 'missed' | 'rejected';
  durationSeconds: number;
}): Promise<void> {
  await setDoc(doc(collection(db, 'users', params.uid, 'callHistory')), {
    otherUid: params.otherUid,
    otherName: params.otherName,
    type: params.type,
    direction: params.direction,
    outcome: params.outcome,
    durationSeconds: params.durationSeconds,
    createdAt: serverTimestamp(),
  });
}
