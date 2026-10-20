import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createLivekitRouter } from './routes/livekit.js';
import { createMeetingRouter } from './routes/meetings.js';
import youtubeRoutes from './routes/youtube.js';
import giAiRoutes from './routes/giAi.js';
import invitationRoutes from './routes/invitations.js';
import { verifyFirebaseAuth } from './middleware/verifyFirebaseAuth.js';
import { createParticipantToken, kickParticipant, muteParticipantTrack } from './services/livekitService.js';
import { db } from './services/firebaseAdmin.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createMeetingPasswordVerifier, verifyMeetingPassword } from './services/meetingPassword.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/livekit', createLivekitRouter({ db, verifyFirebaseAuth, createParticipantToken }));
app.use('/api/meetings', createMeetingRouter({
  db,
  verifyFirebaseAuth,
  kickParticipant,
  muteParticipantTrack,
  createMeetingPasswordVerifier,
  verifyMeetingPassword,
  timestamp: Timestamp,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  arrayUnion: (...values) => FieldValue.arrayUnion(...values),
  arrayRemove: (...values) => FieldValue.arrayRemove(...values),
  deleteField: () => FieldValue.delete(),
}));
app.use('/api/youtube', youtubeRoutes);
app.use('/api/gi-ai', giAiRoutes);
app.use('/api/invitations', invitationRoutes);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ message: 'Internal server error.' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`GI MEET backend listening on port ${PORT}`);
});
