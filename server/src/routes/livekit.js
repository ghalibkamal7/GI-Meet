import { Router } from 'express';

export function createLivekitRouter({ db, verifyFirebaseAuth, createParticipantToken }) {
  const router = Router();

  router.post('/token', verifyFirebaseAuth, async (req, res) => {
    const { roomName, participantName } = req.body ?? {};
    if (typeof roomName !== 'string' || !/^[A-HJ-NP-Z2-9]{8}$/.test(roomName)
      || typeof participantName !== 'string' || !participantName.trim()
      || participantName.length > 120) {
      return res.status(400).json({ message: 'A valid meeting code and participant name are required.' });
    }

    try {
      const meetingSnapshot = await db.collection('meetings').doc(roomName).get();
      if (!meetingSnapshot.exists) return res.status(404).json({ message: 'This meeting does not exist.' });
      const meeting = meetingSnapshot.data();
      if (meeting.locked && !(meeting.activeParticipants ?? []).includes(req.uid)) {
        return res.status(423).json({ message: 'This meeting is locked.' });
      }
      if (!(meeting.activeParticipants ?? []).includes(req.uid)) {
        return res.status(403).json({ message: 'Join the meeting before requesting a media token.' });
      }

      const result = await createParticipantToken(roomName, req.uid, participantName.trim());
      const currentSnapshot = await db.collection('meetings').doc(roomName).get();
      if (!currentSnapshot.exists
        || !(currentSnapshot.data().activeParticipants ?? []).includes(req.uid)) {
        return res.status(403).json({ message: 'Meeting membership changed. Rejoin before requesting media.' });
      }
      return res.json(result);
    } catch {
      return res.status(500).json({ message: 'Could not authorize meeting media. Please retry.' });
    }
  });

  return router;
}
