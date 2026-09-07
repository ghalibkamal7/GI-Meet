import { Router } from 'express';
import { verifyFirebaseAuth } from '../middleware/verifyFirebaseAuth.js';
import { auth as firebaseAuth, db } from '../services/firebaseAdmin.js';
import {
  getAuthUrl,
  handleOAuthCallback,
  isConnected,
  createBroadcastAndStream,
  transitionBroadcast,
  getViewerCount,
} from '../services/youtubeService.js';
import { startRtmpEgress, stopEgress } from '../services/livekitService.js';
import admin from 'firebase-admin';

const router = Router();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

// In-memory viewer-count pollers, keyed by meeting code. Fine for a single
// backend instance (the MVP target). If you scale the backend horizontally,
// move this to a scheduled Cloud Function or Cloud Tasks instead — an
// in-process setInterval won't survive across instances or restarts.
const viewerPollers = new Map();

function liveStreamDocRef(meetingCode) {
  return db.collection('meetings').doc(meetingCode).collection('meta').doc('liveStream');
}

async function assertIsHost(meetingCode, uid) {
  const snap = await db.collection('meetings').doc(meetingCode).get();
  if (!snap.exists) throw new Error('meeting-not-found');
  if (snap.data().hostUid !== uid) throw new Error('not-host');
  return snap.data();
}

// --- OAuth: started via direct browser navigation (a popup window), so the
// ID token travels as a query param rather than an Authorization header. ---
router.get('/auth-url-redirect', async (req, res) => {
  const idToken = req.query.idToken;
  if (!idToken) return res.status(401).send('Missing idToken.');

  try {
    const decoded = await firebaseAuth.verifyIdToken(String(idToken));
    const url = getAuthUrl(decoded.uid);
    res.redirect(url);
  } catch {
    res.status(401).send('Invalid session.');
  }
});

router.get('/oauth-callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    await handleOAuthCallback(String(code), String(state));
    res.send(`
      <script>
        window.opener?.postMessage({ type: 'youtube-oauth-complete', success: true }, '${FRONTEND_ORIGIN}');
        window.close();
      </script>
      Connected! You can close this window.
    `);
  } catch (err) {
    res.send(`
      <script>
        window.opener?.postMessage({ type: 'youtube-oauth-complete', success: false }, '${FRONTEND_ORIGIN}');
        window.close();
      </script>
      Something went wrong: ${err.message}
    `);
  }
});

router.get('/status', verifyFirebaseAuth, async (req, res) => {
  res.json({ connected: await isConnected(req.uid) });
});

router.post('/go-live', verifyFirebaseAuth, async (req, res) => {
  const { meetingCode, title, description, privacy } = req.body ?? {};
  if (!meetingCode || !title || !privacy) {
    return res.status(400).json({ message: 'meetingCode, title, and privacy are required.' });
  }

  try {
    await assertIsHost(meetingCode, req.uid);
  } catch (err) {
    return res.status(403).json({ message: err.message === 'not-host' ? 'Only the host can start a live stream.' : 'Meeting not found.' });
  }

  const docRef = liveStreamDocRef(meetingCode);
  await docRef.set({ status: 'connecting', errorMessage: null }, { merge: true });

  try {
    const { broadcastId, rtmpUrl, watchUrl } = await createBroadcastAndStream(req.uid, {
      title,
      description,
      privacy,
    });

    await docRef.set({ status: 'ready' }, { merge: true });

    const egressId = await startRtmpEgress(meetingCode, rtmpUrl);

    // enableAutoStart on the broadcast means YouTube transitions to live on
    // its own once it detects the incoming RTMP stream — this explicit
    // transition call is a fallback for accounts/configs where autostart
    // doesn't apply.
    await transitionBroadcast(req.uid, broadcastId, 'live').catch(() => undefined);

    await docRef.set(
      {
        status: 'live',
        broadcastId,
        egressId,
        watchUrl,
        viewerCount: null,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: null,
      },
      { merge: true }
    );

    const interval = setInterval(async () => {
      try {
        const count = await getViewerCount(req.uid, broadcastId);
        await docRef.set({ viewerCount: count }, { merge: true });
      } catch {
        // Non-fatal — viewer count just stays at its last known value.
      }
    }, 30_000);
    viewerPollers.set(meetingCode, interval);

    res.json({ success: true, watchUrl });
  } catch (err) {
    await docRef.set({ status: 'error', errorMessage: err.message }, { merge: true });
    res.status(500).json({ message: err.message });
  }
});

router.post('/stop-live', verifyFirebaseAuth, async (req, res) => {
  const { meetingCode } = req.body ?? {};
  if (!meetingCode) return res.status(400).json({ message: 'meetingCode is required.' });

  try {
    await assertIsHost(meetingCode, req.uid);
  } catch {
    return res.status(403).json({ message: 'Only the host can stop the live stream.' });
  }

  const docRef = liveStreamDocRef(meetingCode);
  const snap = await docRef.get();
  const data = snap.data();

  clearInterval(viewerPollers.get(meetingCode));
  viewerPollers.delete(meetingCode);

  try {
    if (data?.egressId) await stopEgress(data.egressId);
    if (data?.broadcastId) await transitionBroadcast(req.uid, data.broadcastId, 'complete').catch(() => undefined);
    await docRef.set({ status: 'ended' }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    await docRef.set({ status: 'error', errorMessage: err.message }, { merge: true });
    res.status(500).json({ message: err.message });
  }
});

export default router;
