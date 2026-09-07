import { Router } from 'express';
import { verifyFirebaseAuth } from '../middleware/verifyFirebaseAuth.js';
import { kickParticipant, muteParticipantTrack } from '../services/livekitService.js';
import { db } from '../services/firebaseAdmin.js';

const router = Router();

async function assertIsHostOrCoHost(room, uid) {
  const snap = await db.collection('meetings').doc(room).get();
  if (!snap.exists) throw new Error('meeting-not-found');
  const data = snap.data();
  if (data.hostUid !== uid && !(data.coHosts ?? []).includes(uid)) {
    throw new Error('not-authorized');
  }
}

router.post('/:room/kick', verifyFirebaseAuth, async (req, res) => {
  const { room } = req.params;
  const { identity } = req.body ?? {};
  if (!identity) return res.status(400).json({ message: 'identity is required.' });

  try {
    await assertIsHostOrCoHost(room, req.uid);
    await kickParticipant(room, identity);
    res.json({ success: true });
  } catch (err) {
    const code = err.message === 'not-authorized' ? 403 : err.message === 'meeting-not-found' ? 404 : 500;
    res.status(code).json({ message: err.message === 'not-authorized' ? 'Only the host or a co-host can remove participants.' : err.message });
  }
});

router.post('/:room/mute-participant', verifyFirebaseAuth, async (req, res) => {
  const { room } = req.params;
  const { identity, source } = req.body ?? {}; // source: 'camera' | 'microphone'
  if (!identity || !source) return res.status(400).json({ message: 'identity and source are required.' });

  try {
    await assertIsHostOrCoHost(room, req.uid);
    await muteParticipantTrack(room, identity, source);
    res.json({ success: true });
  } catch (err) {
    const code = err.message === 'not-authorized' ? 403 : 500;
    res.status(code).json({ message: err.message === 'not-authorized' ? 'Only the host or a co-host can do that.' : err.message });
  }
});

export default router;
