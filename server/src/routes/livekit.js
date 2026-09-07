import { Router } from 'express';
import { verifyFirebaseAuth } from '../middleware/verifyFirebaseAuth.js';
import { createParticipantToken } from '../services/livekitService.js';

const router = Router();

router.post('/token', verifyFirebaseAuth, async (req, res) => {
  const { roomName, participantName } = req.body ?? {};
  if (!roomName || !participantName) {
    return res.status(400).json({ message: 'roomName and participantName are required.' });
  }

  try {
    // identity = uid guarantees a stable, spoof-proof participant identity per room.
    const result = await createParticipantToken(roomName, req.uid, participantName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
