import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  query,
  where,
  orderBy,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { appConfig } from '../../config/appConfig';
import type { Meeting } from './meetingTypes';

/** Cryptographically random meeting code — NOT a predictable sequential ID. */
function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  const bytes = new Uint8Array(appConfig.meetingCodeLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// Simple client-side hash so a plaintext password never sits in Firestore.
// Not cryptographically hardened — fine for "don't let randoms guess the
// code" style meeting passwords, not for anything security-critical.
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createMeeting(params: {
  hostUid: string;
  title: string;
  groupId?: string | null;
  isAudioOnly?: boolean;
  password?: string;
  waitingRoomEnabled?: boolean;
  description?: string;
  scheduledAt?: number | null;
  invitedUids?: string[];
}): Promise<string> {
  const code = generateMeetingCode();
  await setDoc(doc(db, 'meetings', code), {
    title: params.title,
    description: params.description ?? '',
    hostUid: params.hostUid,
    coHosts: [],
    groupId: params.groupId ?? null,
    createdAt: serverTimestamp(),
    startedAt: null,
    endedAt: null,
    locked: false,
    isAudioOnly: Boolean(params.isAudioOnly),
    passwordHash: params.password ? await hashPassword(params.password) : null,
    waitingRoomEnabled: Boolean(params.waitingRoomEnabled),
    activeParticipants: [],
    waitingParticipants: [],
    allParticipants: [params.hostUid],
    scheduledAt: params.scheduledAt ?? null,
    status: params.scheduledAt ? 'scheduled' : 'instant',
    invitedUids: params.invitedUids ?? [],
  });
  return code;
}

function docToMeeting(id: string, data: any): Meeting {
  return {
    id,
    title: data.title,
    description: data.description ?? '',
    hostUid: data.hostUid,
    coHosts: data.coHosts ?? [],
    groupId: data.groupId,
    createdAt: data.createdAt?.toMillis?.() ?? 0,
    startedAt: data.startedAt?.toMillis?.() ?? null,
    endedAt: data.endedAt?.toMillis?.() ?? null,
    locked: Boolean(data.locked),
    isAudioOnly: Boolean(data.isAudioOnly),
    hasPassword: Boolean(data.passwordHash),
    waitingRoomEnabled: Boolean(data.waitingRoomEnabled),
    activeParticipants: data.activeParticipants ?? [],
    waitingParticipants: data.waitingParticipants ?? [],
    scheduledAt: data.scheduledAt?.toMillis?.() ?? null,
    status: data.status ?? 'instant',
    invitedUids: data.invitedUids ?? [],
  };
}

export async function getMeeting(code: string): Promise<Meeting | null> {
  const snap = await getDoc(doc(db, 'meetings', code));
  if (!snap.exists()) return null;
  return docToMeeting(snap.id, snap.data());
}

export function subscribeToMeeting(code: string, callback: (meeting: Meeting | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'meetings', code), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(docToMeeting(snap.id, snap.data()));
  });
}

export async function verifyMeetingPassword(code: string, password: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'meetings', code));
  if (!snap.exists()) return false;
  const data = snap.data();
  if (!data.passwordHash) return true;
  return (await hashPassword(password)) === data.passwordHash;
}

/**
 * Joins a meeting. If a waiting room is enabled (and the joiner isn't the
 * host/a co-host), they land in `waitingParticipants` instead and must be
 * admitted — see `admitFromWaitingRoom`.
 */
export async function joinMeeting(code: string, uid: string): Promise<{ waiting: boolean }> {
  const meetingRef = doc(db, 'meetings', code);
  const snap = await getDoc(meetingRef);
  if (!snap.exists()) throw new Error('meeting-not-found');
  const data = snap.data();
  if (data.locked) throw new Error('meeting-locked');

  const isHostOrCoHost = data.hostUid === uid || (data.coHosts ?? []).includes(uid);

  if (data.waitingRoomEnabled && !isHostOrCoHost) {
    await updateDoc(meetingRef, {
      waitingParticipants: arrayUnion(uid),
      allParticipants: arrayUnion(uid),
    });
    return { waiting: true };
  }

  await updateDoc(meetingRef, {
    activeParticipants: arrayUnion(uid),
    allParticipants: arrayUnion(uid),
    startedAt: data.startedAt ?? serverTimestamp(),
  });
  return { waiting: false };
}

export async function admitFromWaitingRoom(code: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'meetings', code), {
    waitingParticipants: arrayRemove(uid),
    activeParticipants: arrayUnion(uid),
  });
}

export async function denyFromWaitingRoom(code: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'meetings', code), {
    waitingParticipants: arrayRemove(uid),
  });
}

export async function leaveMeeting(code: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'meetings', code), {
    activeParticipants: arrayRemove(uid),
    waitingParticipants: arrayRemove(uid),
  });
}

export async function endMeeting(code: string): Promise<void> {
  await updateDoc(doc(db, 'meetings', code), {
    endedAt: serverTimestamp(),
    activeParticipants: [],
    locked: true,
  });
}

export async function toggleLock(code: string, locked: boolean): Promise<void> {
  await updateDoc(doc(db, 'meetings', code), { locked });
}

export async function addCoHost(code: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'meetings', code), { coHosts: arrayUnion(uid) });
}

export async function removeCoHost(code: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'meetings', code), { coHosts: arrayRemove(uid) });
}

export async function subscribeToUserMeetingHistory(
  uid: string
): Promise<Array<{ id: string; title: string; startedAt: number; endedAt: number | null; hostUid: string; durationMinutes: number }>> {
  const q = query(
    collection(db, 'meetings'),
    where('allParticipants', 'array-contains', uid),
    where('endedAt', '!=', null),
    orderBy('endedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const startedAt = data.startedAt?.toMillis?.() ?? 0;
    const endedAt = data.endedAt?.toMillis?.() ?? 0;
    return {
      id: d.id,
      title: data.title,
      startedAt,
      endedAt,
      hostUid: data.hostUid,
      durationMinutes: Math.max(0, Math.round((endedAt - startedAt) / 60000)),
    };
  });
}

export async function getUpcomingMeetings(uid: string): Promise<Meeting[]> {
  const q = query(
    collection(db, 'meetings'),
    where('invitedUids', 'array-contains', uid),
    where('status', '==', 'scheduled')
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => docToMeeting(d.id, d.data()))
    .filter((m) => !m.endedAt && (m.scheduledAt ?? 0) > Date.now() - 3600_000)
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
}
