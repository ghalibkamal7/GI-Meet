import {
  collection,
  doc,
  setDoc,
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
import { authedFetch } from '../../services/authedFetch';

/** Cryptographically random meeting code — NOT a predictable sequential ID. */
function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  const bytes = new Uint8Array(appConfig.meetingCodeLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
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
  if (params.password) {
    const response = await authedFetch('/api/meetings/protected', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description ?? '',
        groupId: params.groupId ?? null,
        isAudioOnly: Boolean(params.isAudioOnly),
        password: params.password,
        waitingRoomEnabled: Boolean(params.waitingRoomEnabled),
        scheduledAt: params.scheduledAt ?? null,
        invitedUids: params.invitedUids ?? [],
      }),
    });
    const result = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    if (!response.ok || !result?.code) {
      throw new Error(result?.message ?? 'Could not create this meeting. Please try again.');
    }
    return result.code;
  }

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
    hasPassword: false,
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
    hasPassword: Boolean(data.hasPassword || data.passwordHash),
    waitingRoomEnabled: Boolean(data.waitingRoomEnabled),
    activeParticipants: data.activeParticipants ?? [],
    waitingParticipants: data.waitingParticipants ?? [],
    scheduledAt: data.scheduledAt?.toMillis?.() ?? null,
    status: data.status ?? 'instant',
    invitedUids: data.invitedUids ?? [],
  };
}

export interface MeetingLobbyPreview {
  id: string;
  hasPassword: boolean;
  waitingRoomEnabled: boolean;
  isAudioOnly: boolean;
  locked: boolean;
  ended: boolean;
}

export async function getMeetingLobbyPreview(code: string): Promise<MeetingLobbyPreview | null> {
  const response = await authedFetch(`/api/meetings/${encodeURIComponent(code)}/preview`);
  const result = await response.json().catch(() => null) as MeetingLobbyPreview | { message?: string } | null;
  if (response.status === 404) return null;
  if (!response.ok || !result || !('hasPassword' in result)) {
    throw new Error(result && 'message' in result && result.message
      ? result.message
      : 'Could not load this meeting. Please retry.');
  }
  return result;
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
  const response = await authedFetch(`/api/meetings/${encodeURIComponent(code)}/authorize`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  const result = await response.json().catch(() => null) as { authorized?: boolean; message?: string } | null;
  if (response.status === 403) return false;
  if (!response.ok || !result?.authorized) {
    throw new Error(result?.message ?? 'Could not verify the meeting password. Please retry.');
  }
  return true;
}

/**
 * Joins a meeting. If a waiting room is enabled (and the joiner isn't the
 * host/a co-host), they land in `waitingParticipants` instead and must be
 * admitted — see `admitFromWaitingRoom`.
 */
export async function joinMeeting(code: string): Promise<{ waiting: boolean }> {
  const response = await authedFetch(`/api/meetings/${encodeURIComponent(code)}/join`, {
    method: 'POST',
  });
  const result = await response.json().catch(() => null) as { waiting?: boolean; message?: string } | null;
  if (!response.ok || typeof result?.waiting !== 'boolean') {
    throw new Error(result?.message ?? 'Could not join this meeting. Please try again.');
  }
  return { waiting: result.waiting };
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
