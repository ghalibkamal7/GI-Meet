import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { createVerifyFirebaseAuth } from '../src/middleware/createVerifyFirebaseAuth.js';
import { createLivekitRouter } from '../src/routes/livekit.js';

function createDatabase(meetings) {
  return {
    collection(name) {
      assert.equal(name, 'meetings');
      return {
        doc(id) {
          return {
            async get() {
              const data = meetings[id];
              return { exists: data !== undefined, data: () => data };
            },
          };
        },
      };
    },
  };
}

async function startServer(meetings, createParticipantToken) {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use('/api/livekit', createLivekitRouter({
    db: createDatabase(meetings),
    verifyFirebaseAuth: createVerifyFirebaseAuth({
      async verifyIdToken(token) {
        if (token !== 'valid') throw new Error('invalid');
        return { uid: 'member-1' };
      },
    }),
    createParticipantToken: async (...args) => {
      calls.push(args);
      return createParticipantToken
        ? createParticipantToken(...args)
        : { token: 'test-only-token', url: 'wss://livekit.test' };
    },
  }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    calls,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
    async request(body, token = 'valid') {
      const headers = { 'content-type': 'application/json' };
      if (token !== null) headers.authorization = `Bearer ${token}`;
      return fetch(`http://127.0.0.1:${address.port}/api/livekit/token`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    },
  };
}

test('LiveKit token endpoint rejects missing and invalid Firebase authentication', async (t) => {
  const server = await startServer({ ABCD2345: { activeParticipants: ['member-1'] } });
  t.after(() => server.close());

  assert.equal((await server.request({ roomName: 'ABCD2345', participantName: 'Member' }, null)).status, 401);
  assert.equal((await server.request({ roomName: 'ABCD2345', participantName: 'Member' }, 'invalid')).status, 401);
});

test('LiveKit tokens require active membership, blocking password and waiting-room bypasses', async (t) => {
  const server = await startServer({
    ABCD2345: { hasPassword: true, activeParticipants: ['host-1'], waitingParticipants: ['member-1'], locked: false },
    EFGH2345: { activeParticipants: ['member-1'], waitingParticipants: [], locked: true },
  });
  t.after(() => server.close());

  assert.equal((await server.request({ roomName: 'ABCD2345', participantName: 'Member' })).status, 403);
  assert.equal((await server.request({
    roomName: 'EFGH2345',
    participantName: 'Member',
    uid: 'host-spoof',
  })).status, 200);
  assert.equal(server.calls.length, 1);
  assert.deepEqual(server.calls[0], ['EFGH2345', 'member-1', 'Member']);
});

test('open-meeting media tokens still require joining, and malformed codes are rejected', async (t) => {
  const server = await startServer({
    ABCD2345: { hasPassword: false, activeParticipants: [], waitingParticipants: [], locked: false },
    BCDE2345: { hasPassword: false, activeParticipants: ['member-1'], waitingParticipants: [], locked: false },
  });
  t.after(() => server.close());

  assert.equal((await server.request({ roomName: 'ABCD2345', participantName: 'Member' })).status, 403);
  assert.equal((await server.request({ roomName: 'BCDE2345', participantName: 'Member' })).status, 200);
  assert.equal((await server.request({ roomName: 'invalid', participantName: 'Member' })).status, 400);
});

test('LiveKit token is withheld if membership is revoked while token creation is in flight', async (t) => {
  const meetings = {
    ABCD2345: { activeParticipants: ['member-1'], locked: false },
  };
  const server = await startServer(meetings, async () => {
    meetings.ABCD2345.activeParticipants = [];
    return { token: 'test-only-token', url: 'wss://livekit.test' };
  });
  t.after(() => server.close());

  const response = await server.request({ roomName: 'ABCD2345', participantName: 'Member' });
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /membership changed/);
});

test('issued LiveKit access tokens expire after two minutes and use the verified UID identity', async () => {
  process.env.LIVEKIT_API_KEY = 'test-api-key';
  process.env.LIVEKIT_API_SECRET = 'test-api-secret-that-is-not-used-outside-this-test';
  process.env.LIVEKIT_URL = 'wss://livekit.test';
  const { createParticipantToken } = await import('../src/services/livekitService.js');

  const { token } = await createParticipantToken('ABCD2345', 'member-1', 'Member');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.sub, 'member-1');
  assert.equal(claims.video.room, 'ABCD2345');
  assert.equal(claims.exp - claims.nbf, 120);
});
