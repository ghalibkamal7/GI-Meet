import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import livekitRoutes from './routes/livekit.js';
import meetingRoutes from './routes/meetings.js';
import youtubeRoutes from './routes/youtube.js';
import giAiRoutes from './routes/giAi.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/livekit', livekitRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/gi-ai', giAiRoutes);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ message: 'Internal server error.' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`GI MEET backend listening on port ${PORT}`);
});
