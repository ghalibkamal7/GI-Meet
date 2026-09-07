import { google } from 'googleapis';
import { db } from './firebaseAdmin.js';

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI;

const SCOPES = ['https://www.googleapis.com/auth/youtube'];

function assertConfigured() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error(
      'YouTube OAuth is not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and ' +
        'YOUTUBE_REDIRECT_URI in server/.env (create these in Google Cloud Console > Credentials).'
    );
  }
}

function newOAuthClient() {
  assertConfigured();
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

/** `state` carries the Firebase uid through the OAuth redirect round-trip. */
export function getAuthUrl(uid) {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent', // forces refresh_token on repeat authorizations too
    scope: SCOPES,
    state: uid,
  });
}

/**
 * Tokens are stored server-side ONLY, in a collection Firestore security
 * rules never grant client access to (everything not explicitly allowed in
 * firestore.rules is denied by the catch-all rule). The frontend never sees
 * an access or refresh token.
 */
export async function handleOAuthCallback(code, uid) {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  await db.collection('youtubeTokens').doc(uid).set(
    {
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token,
      expiryDate: tokens.expiry_date,
    },
    { merge: true }
  );
}

export async function isConnected(uid) {
  const snap = await db.collection('youtubeTokens').doc(uid).get();
  return snap.exists && Boolean(snap.data().refreshToken);
}

async function getAuthorizedClient(uid) {
  const snap = await db.collection('youtubeTokens').doc(uid).get();
  if (!snap.exists) throw new Error('youtube-not-connected');

  const data = snap.data();
  const client = newOAuthClient();
  client.setCredentials({
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    expiry_date: data.expiryDate,
  });

  // Persist refreshed access tokens so we don't re-prompt the user.
  client.on('tokens', (tokens) => {
    const updates = { accessToken: tokens.access_token };
    if (tokens.refresh_token) updates.refreshToken = tokens.refresh_token;
    db.collection('youtubeTokens').doc(uid).set(updates, { merge: true }).catch(() => undefined);
  });

  return client;
}

/**
 * Creates a broadcast + stream, binds them, and returns the RTMP ingestion
 * URL (ingestionAddress + streamName) that LiveKit Egress will push to.
 */
export async function createBroadcastAndStream(uid, { title, description, privacy }) {
  const auth = await getAuthorizedClient(uid);
  const youtube = google.youtube({ version: 'v3', auth });

  const broadcastRes = await youtube.liveBroadcasts.insert({
    part: ['snippet', 'status', 'contentDetails'],
    requestBody: {
      snippet: {
        title,
        description,
        scheduledStartTime: new Date().toISOString(),
      },
      status: { privacyStatus: privacy },
      contentDetails: { enableAutoStart: true, enableAutoStop: true },
    },
  });

  const streamRes = await youtube.liveStreams.insert({
    part: ['snippet', 'cdn'],
    requestBody: {
      snippet: { title: `${title} - stream` },
      cdn: { frameRate: '30fps', ingestionType: 'rtmp', resolution: '1080p' },
    },
  });

  await youtube.liveBroadcasts.bind({
    part: ['id'],
    id: broadcastRes.data.id,
    streamId: streamRes.data.id,
  });

  const ingestion = streamRes.data.cdn.ingestionInfo;

  return {
    broadcastId: broadcastRes.data.id,
    streamId: streamRes.data.id,
    rtmpUrl: `${ingestion.ingestionAddress}/${ingestion.streamName}`,
    watchUrl: `https://www.youtube.com/watch?v=${broadcastRes.data.id}`,
  };
}

export async function transitionBroadcast(uid, broadcastId, status) {
  const auth = await getAuthorizedClient(uid);
  const youtube = google.youtube({ version: 'v3', auth });
  await youtube.liveBroadcasts.transition({
    part: ['id', 'status'],
    id: broadcastId,
    broadcastStatus: status, // 'live' | 'complete'
  });
}

/**
 * Viewer count is not guaranteed to be available right after a stream
 * starts — callers must treat a missing value as "--", not zero.
 */
export async function getViewerCount(uid, videoId) {
  const auth = await getAuthorizedClient(uid);
  const youtube = google.youtube({ version: 'v3', auth });
  const res = await youtube.videos.list({ part: ['liveStreamingDetails'], id: [videoId] });
  const count = res.data.items?.[0]?.liveStreamingDetails?.concurrentViewers;
  return count != null ? Number(count) : null;
}
