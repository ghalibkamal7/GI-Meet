import { Router } from 'express';
import { randomInt } from 'node:crypto';

const MEETING_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSWORD_MAX_LENGTH = 256;
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_MAX_ATTEMPTS = 10;
const JOIN_AUTHORIZATION_MS = 2 * 60 * 1000;

function generateMeetingCode() {
  return Array.from({ length: 8 }, () => MEETING_CODE_CHARS[randomInt(MEETING_CODE_CHARS.length)]).join('');
}

function isAlreadyExists(error) {
  return error?.code === 6 || error?.code === '6' || error?.code === 'already-exists';
}

function validateProtectedMeeting(body) {
  if (!body || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120) return null;
  if (typeof body.password !== 'string' || !body.password.trim() || body.password.length > PASSWORD_MAX_LENGTH) return null;
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 2000)) return null;
  if (body.groupId !== undefined && body.groupId !== null && typeof body.groupId !== 'string') return null;
  if (body.isAudioOnly !== undefined && typeof body.isAudioOnly !== 'boolean') return null;
  if (body.waitingRoomEnabled !== undefined && typeof body.waitingRoomEnabled !== 'boolean') return null;
  if (body.scheduledAt !== undefined && body.scheduledAt !== null
    && (!Number.isSafeInteger(body.scheduledAt) || body.scheduledAt <= Date.now())) return null;
  if (body.invitedUids !== undefined && (
    !Array.isArray(body.invitedUids)
    || body.invitedUids.length > 100
    || body.invitedUids.some((uid) => typeof uid !== 'string' || !uid || uid.length > 128)
  )) return null;

  return {
    title: body.title.trim(),
    description: body.description ?? '',
    groupId: body.groupId ?? null,
    isAudioOnly: body.isAudioOnly === true,
    waitingRoomEnabled: body.waitingRoomEnabled === true,
    scheduledAt: body.scheduledAt ?? null,
    invitedUids: [...new Set(body.invitedUids ?? [])],
    password: body.password,
  };
}

async function assertIsHostOrCoHost(db, room, uid) {
  const snap = await db.collection('meetings').doc(room).get();
  if (!snap.exists) throw new Error('meeting-not-found');
  const data = snap.data();
  if (data.hostUid !== uid && !(data.coHosts ?? []).includes(uid)) {
    throw new Error('not-authorized');
  }
}

export function createMeetingRouter({
  db,
  verifyFirebaseAuth,
  kickParticipant,
  muteParticipantTrack,
  createMeetingPasswordVerifier,
  verifyMeetingPassword,
  timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  now = Date.now,
  generateCode = generateMeetingCode,
}) {
  const router = Router();

  router.get('/:room/preview', verifyFirebaseAuth, async (req, res) => {
    const { room } = req.params;
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(room)) {
      return res.status(400).json({ message: 'A valid meeting code is required.' });
    }
    try {
      const snap = await db.collection('meetings').doc(room).get();
      if (!snap.exists) return res.status(404).json({ message: 'This meeting does not exist.' });
      const data = snap.data();
      return res.json({
        id: snap.id,
        hasPassword: Boolean(data.hasPassword || data.passwordHash),
        waitingRoomEnabled: Boolean(data.waitingRoomEnabled),
        isAudioOnly: Boolean(data.isAudioOnly),
        locked: Boolean(data.locked),
        ended: Boolean(data.endedAt),
      });
    } catch {
      return res.status(500).json({ message: 'Could not load this meeting. Please retry.' });
    }
  });

  router.post('/protected', verifyFirebaseAuth, async (req, res) => {
    const params = validateProtectedMeeting(req.body);
    if (!params) return res.status(400).json({ message: 'Meeting details or password are invalid.' });

    try {
      if (params.groupId) {
        const group = await db.collection('groups').doc(params.groupId).get();
        if (!group.exists || !(group.data().members ?? []).includes(req.uid)) {
          return res.status(403).json({ message: 'Only group members can schedule a group meeting.' });
        }
      }

      const passwordVerifier = await createMeetingPasswordVerifier(params.password);
      const invitedUids = [...new Set([req.uid, ...params.invitedUids])];
      const meetingData = {
        title: params.title,
        description: params.description,
        hostUid: req.uid,
        coHosts: [],
        groupId: params.groupId,
        createdAt: serverTimestamp(),
        startedAt: null,
        endedAt: null,
        locked: false,
        isAudioOnly: params.isAudioOnly,
        hasPassword: true,
        waitingRoomEnabled: params.waitingRoomEnabled,
        activeParticipants: [],
        waitingParticipants: [],
        allParticipants: [req.uid],
        scheduledAt: params.scheduledAt,
        status: params.scheduledAt ? 'scheduled' : 'instant',
        invitedUids,
      };

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateCode();
        const meetingRef = db.collection('meetings').doc(code);
        const secretRef = meetingRef.collection('passwordSecret').doc('verifier');
        const batch = db.batch();
        batch.create(meetingRef, meetingData);
        batch.create(secretRef, passwordVerifier);
        try {
          await batch.commit();
          return res.status(201).json({ code });
        } catch (error) {
          if (!isAlreadyExists(error) || attempt === 4) throw error;
        }
      }
      return res.status(500).json({ message: 'Could not create this meeting. Please try again.' });
    } catch {
      return res.status(500).json({ message: 'Could not create this meeting. Please try again.' });
    }
  });

  router.post('/:room/authorize', verifyFirebaseAuth, async (req, res) => {
    const { room } = req.params;
    const { password } = req.body ?? {};
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(room) || typeof password !== 'string'
      || !password.trim() || password.length > PASSWORD_MAX_LENGTH) {
      return res.status(400).json({ message: 'A valid meeting code and password are required.' });
    }

    try {
      const meetingRef = db.collection('meetings').doc(room);
      const secretRef = meetingRef.collection('passwordSecret').doc('verifier');
      const attemptRef = meetingRef.collection('passwordAttempts').doc(req.uid);
      const authorizationRef = meetingRef.collection('passwordAuthorizations').doc(req.uid);
      const currentTime = now();
      const outcome = await db.runTransaction(async (transaction) => {
        const [meetingSnapshot, secretSnapshot, attemptSnapshot] = await Promise.all([
          transaction.get(meetingRef),
          transaction.get(secretRef),
          transaction.get(attemptRef),
        ]);
        if (!meetingSnapshot.exists) return 'not-found';
        const meeting = meetingSnapshot.data();
        if (meeting.locked) return 'locked';

        const storedVerifier = secretSnapshot.exists
          ? secretSnapshot.data()
          : typeof meeting.passwordHash === 'string'
            ? { passwordHash: meeting.passwordHash }
            : null;
        const isProtected = Boolean(meeting.hasPassword || storedVerifier);
        if (!isProtected || meeting.hostUid === req.uid || (meeting.coHosts ?? []).includes(req.uid)) {
          return 'authorized';
        }
        if (!storedVerifier) return 'missing-verifier';

        const attempt = attemptSnapshot.exists ? attemptSnapshot.data() : {};
        const previousStart = Number(attempt.windowStartAt ?? 0);
        const previousCount = currentTime - previousStart < PASSWORD_WINDOW_MS
          ? Number(attempt.count ?? 0)
          : 0;
        if (previousCount >= PASSWORD_MAX_ATTEMPTS) return 'rate-limited';

        if (!await verifyMeetingPassword(password, storedVerifier)) {
          transaction.set(attemptRef, {
            windowStartAt: previousCount ? previousStart : currentTime,
            count: previousCount + 1,
          });
          return 'incorrect';
        }

        if (storedVerifier.algorithm !== 'scrypt' || storedVerifier.version !== 1) {
          const scryptVerifier = await createMeetingPasswordVerifier(password);
          transaction.set(secretRef, scryptVerifier);
        }
        if (typeof meeting.passwordHash === 'string') {
          transaction.update(meetingRef, {
            passwordHash: deleteField(),
            hasPassword: true,
          });
        }
        transaction.set(authorizationRef, {
          expiresAt: timestamp.fromMillis(currentTime + JOIN_AUTHORIZATION_MS),
        });
        transaction.delete(attemptRef);
        return 'authorized';
      });

      if (outcome === 'not-found') return res.status(404).json({ message: 'This meeting does not exist.' });
      if (outcome === 'locked') return res.status(423).json({ message: 'This meeting is locked.' });
      if (outcome === 'missing-verifier') return res.status(503).json({ message: 'This meeting password is unavailable. Contact the host.' });
      if (outcome === 'rate-limited') return res.status(429).json({ message: 'Too many incorrect attempts. Wait 15 minutes and try again.' });
      if (outcome === 'incorrect') return res.status(403).json({ message: 'Incorrect meeting password.' });
      return res.json({ authorized: true });
    } catch {
      return res.status(500).json({ message: 'Could not verify the meeting password. Please retry.' });
    }
  });

  router.post('/:room/join', verifyFirebaseAuth, async (req, res) => {
    const { room } = req.params;
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(room)) {
      return res.status(400).json({ message: 'A valid meeting code is required.' });
    }

    try {
      const meetingRef = db.collection('meetings').doc(room);
      const authorizationRef = meetingRef.collection('passwordAuthorizations').doc(req.uid);
      let waiting = false;

      await db.runTransaction(async (transaction) => {
        const meetingSnapshot = await transaction.get(meetingRef);
        if (!meetingSnapshot.exists) throw new Error('meeting-not-found');
        const meeting = meetingSnapshot.data();
        if (meeting.locked) throw new Error('meeting-locked');

        const isHostOrCoHost = meeting.hostUid === req.uid || (meeting.coHosts ?? []).includes(req.uid);
        const alreadyJoined = (meeting.activeParticipants ?? []).includes(req.uid)
          || (meeting.waitingParticipants ?? []).includes(req.uid);
        if ((meeting.hasPassword || meeting.passwordHash) && !alreadyJoined) {
          if (!isHostOrCoHost) {
            const authorizationSnapshot = await transaction.get(authorizationRef);
            const expiresAt = authorizationSnapshot.exists
              ? authorizationSnapshot.data().expiresAt?.toMillis?.()
                ?? authorizationSnapshot.data().expiresAt?.millis
              : null;
            if (typeof expiresAt !== 'number' || expiresAt <= now()) {
              throw new Error('meeting-password-required');
            }
            transaction.delete(authorizationRef);
          }
        }

        waiting = Boolean(meeting.waitingRoomEnabled && !isHostOrCoHost);
        const update = {
          allParticipants: arrayUnion(req.uid),
        };
        if (waiting) {
          update.waitingParticipants = arrayUnion(req.uid);
        } else {
          update.activeParticipants = arrayUnion(req.uid);
          if (!meeting.startedAt) update.startedAt = serverTimestamp();
        }
        transaction.update(meetingRef, update);
      });

      return res.json({ waiting });
    } catch (error) {
      if (error.message === 'meeting-not-found') return res.status(404).json({ message: 'This meeting does not exist.' });
      if (error.message === 'meeting-locked') return res.status(423).json({ message: 'This meeting is locked.' });
      if (error.message === 'meeting-password-required') {
        return res.status(403).json({ message: 'Enter the meeting password before joining.' });
      }
      return res.status(500).json({ message: 'Could not join this meeting. Please try again.' });
    }
  });

  router.post('/:room/kick', verifyFirebaseAuth, async (req, res) => {
    const { room } = req.params;
    const { identity } = req.body ?? {};
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(room)
      || typeof identity !== 'string'
      || !identity.trim()
      || identity.length > 128) {
      return res.status(400).json({ message: 'A valid meeting code and participant identity are required.' });
    }

    try {
      const meetingRef = db.collection('meetings').doc(room);
      const outcome = await db.runTransaction(async (transaction) => {
        const meetingSnapshot = await transaction.get(meetingRef);
        if (!meetingSnapshot.exists) return 'meeting-not-found';
        const meeting = meetingSnapshot.data();
        if (meeting.hostUid !== req.uid && !(meeting.coHosts ?? []).includes(req.uid)) {
          return 'not-authorized';
        }
        if (meeting.hostUid === identity) return 'host-cannot-be-removed';
        const isParticipant = (meeting.activeParticipants ?? []).includes(identity)
          || (meeting.waitingParticipants ?? []).includes(identity)
          || (meeting.allParticipants ?? []).includes(identity);
        if (!isParticipant) return 'participant-not-found';
        transaction.update(meetingRef, {
          activeParticipants: arrayRemove(identity),
          waitingParticipants: arrayRemove(identity),
        });
        return 'removed';
      });
      if (outcome === 'meeting-not-found') {
        return res.status(404).json({ message: 'This meeting does not exist.' });
      }
      if (outcome === 'not-authorized') {
        return res.status(403).json({ message: 'Only the host or a co-host can remove participants.' });
      }
      if (outcome === 'host-cannot-be-removed') {
        return res.status(400).json({ message: 'The meeting host cannot be removed.' });
      }
      if (outcome === 'participant-not-found') {
        return res.status(404).json({ message: 'This participant is not in the meeting.' });
      }
      await kickParticipant(room, identity);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: 'Could not remove this participant. Please retry.' });
    }
  });

  router.post('/:room/mute-participant', verifyFirebaseAuth, async (req, res) => {
    const { room } = req.params;
    const { identity, source } = req.body ?? {};
    if (!identity || !source) return res.status(400).json({ message: 'identity and source are required.' });

    try {
      await assertIsHostOrCoHost(db, room, req.uid);
      await muteParticipantTrack(room, identity, source);
      res.json({ success: true });
    } catch (err) {
      const code = err.message === 'not-authorized' ? 403 : 500;
      res.status(code).json({ message: err.message === 'not-authorized' ? 'Only the host or a co-host can do that.' : err.message });
    }
  });

  return router;
}
