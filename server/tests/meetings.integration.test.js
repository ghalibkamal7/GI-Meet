import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { createVerifyFirebaseAuth } from '../src/middleware/createVerifyFirebaseAuth.js';
import { createMeetingRouter } from '../src/routes/meetings.js';
import { createLivekitRouter } from '../src/routes/livekit.js';
import {
  createMeetingPasswordVerifier,
  verifyMeetingPassword,
} from '../src/services/meetingPassword.js';

function clone(value) {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}

function createDatabase(seed = {}) {
  const state = new Map(Object.entries(seed).map(([path, value]) => [path, clone(value)]));
  let transactionTail = Promise.resolve();

  function makeRef(path) {
    const segments = path.split('/');
    return {
      id: segments.at(-1),
      path,
      collection(name) {
        return makeCollection(`${path}/${name}`);
      },
      async get() {
        const data = state.get(path);
        return { id: segments.at(-1), exists: data !== undefined, data: () => clone(data) };
      },
      async set(data) {
        state.set(path, clone(data));
      },
      async delete() {
        state.delete(path);
      },
    };
  }

  function makeCollection(path) {
    return { doc: (id) => makeRef(`${path}/${id}`) };
  }

  const db = {
    collection: makeCollection,
    batch() {
      const creates = [];
      return {
        create(ref, data) {
          creates.push([ref.path, data]);
        },
        async commit() {
          if (creates.some(([path]) => state.has(path))) {
            throw Object.assign(new Error('already exists'), { code: 'already-exists' });
          }
          for (const [path, data] of creates) state.set(path, clone(data));
        },
      };
    },
    async runTransaction(callback) {
      const previousTransaction = transactionTail;
      let releaseTransaction;
      transactionTail = new Promise((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;
      try {
        const writes = [];
        const transaction = {
          get: (ref) => ref.get(),
          set: (ref, data) => writes.push(() => state.set(ref.path, clone(data))),
          update: (ref, fields) => writes.push(() => {
            const current = state.get(ref.path);
            if (!current) throw new Error('document does not exist');
            for (const [key, value] of Object.entries(fields)) {
              if (value?.kind === 'arrayUnion') {
                current[key] = [...new Set([...(current[key] ?? []), ...value.values])];
              } else if (value?.kind === 'arrayRemove') {
                current[key] = (current[key] ?? []).filter((item) => !value.values.includes(item));
              } else if (value?.kind === 'delete-field') {
                delete current[key];
              } else {
                current[key] = clone(value);
              }
            }
          }),
          delete: (ref) => writes.push(() => state.delete(ref.path)),
        };
        const result = await callback(transaction);
        writes.forEach((write) => write());
        return result;
      } finally {
        releaseTransaction();
      }
    },
  };

  return { db, state };
}

async function startServer(database, options = {}) {
  const authClient = {
    async verifyIdToken(token) {
      const users = {
        valid: { uid: 'member-1', email: 'member@example.test' },
        host: { uid: 'host-1', email: 'host@example.test' },
      };
      if (!users[token]) throw new Error('invalid token');
      return users[token];
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/livekit', createLivekitRouter({
    db: database.db,
    verifyFirebaseAuth: createVerifyFirebaseAuth(authClient),
    async createParticipantToken(roomName, uid, name) {
      return { token: 'test-only-token', url: 'wss://livekit.test', roomName, uid, name };
    },
    ...options.livekitDependencies,
  }));
  app.use('/api/meetings', createMeetingRouter({
    db: database.db,
    verifyFirebaseAuth: createVerifyFirebaseAuth(authClient),
    kickParticipant: async () => {},
    muteParticipantTrack: async () => {},
    createMeetingPasswordVerifier,
    verifyMeetingPassword,
    timestamp: { fromMillis: (millis) => ({ millis }) },
    serverTimestamp: () => ({ serverTimestamp: true }),
    arrayUnion: (...values) => ({ kind: 'arrayUnion', values }),
    arrayRemove: (...values) => ({ kind: 'arrayRemove', values }),
    deleteField: () => ({ kind: 'delete-field' }),
    now: options.now ?? (() => 1_000_000),
    generateCode: options.generateCode ?? (() => 'ABCD2345'),
    ...options.dependencies,
  }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
    async request(path, { method = 'POST', token = 'valid', body } = {}) {
      const headers = {};
      if (token !== null) headers.authorization = `Bearer ${token}`;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return fetch(`http://127.0.0.1:${address.port}/api/meetings${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
  };
}

test('password-protected meeting endpoints require a verified Firebase token', async (t) => {
  const database = createDatabase();
  const server = await startServer(database);
  t.after(() => server.close());

  assert.equal((await server.request('/protected', { token: null, body: { title: 'Room', password: 'secret' } })).status, 401);
  assert.equal((await server.request('/ABCD2345/authorize', { token: 'invalid', body: { password: 'secret' } })).status, 401);
});

test('meeting preview exposes lobby state only and requires verified authentication', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': {
      hostUid: 'host-1',
      title: 'Private title',
      passwordHash: 'a'.repeat(64),
      activeParticipants: ['host-1'],
      invitedUids: [],
      waitingRoomEnabled: true,
      isAudioOnly: true,
      locked: false,
      endedAt: null,
    },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  assert.equal((await server.request('/ABCD2345/preview', { method: 'GET', token: null })).status, 401);
  const response = await server.request('/ABCD2345/preview', { method: 'GET' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 'ABCD2345',
    hasPassword: true,
    waitingRoomEnabled: true,
    isAudioOnly: true,
    locked: false,
    ended: false,
  });
  assert.equal((await server.request('/EFGH2345/preview', { method: 'GET' })).status, 404);
});

test('protected meeting creation validates input and binds ownership to the verified UID', async (t) => {
  const database = createDatabase();
  const server = await startServer(database);
  t.after(() => server.close());

  assert.equal((await server.request('/protected', { body: { title: 'Room' } })).status, 400);
  assert.equal((await server.request('/protected', {
    body: { title: 'Room', password: 'secret', hostUid: 'host-1' },
  })).status, 201);

  const meeting = database.state.get('meetings/ABCD2345');
  const verifier = database.state.get('meetings/ABCD2345/passwordSecret/verifier');
  assert.equal(meeting.hostUid, 'member-1');
  assert.equal(meeting.hasPassword, true);
  assert.equal('password' in meeting, false);
  assert.equal('passwordHash' in meeting, false);
  assert.equal(verifier.algorithm, 'scrypt');
  assert.equal(await verifyMeetingPassword('secret', verifier), true);
  assert.equal(await verifyMeetingPassword('incorrect', verifier), false);
});

test('password verification creates a short-lived authorization only for the authenticated UID', async (t) => {
  const passwordVerifier = await createMeetingPasswordVerifier('correct horse');
  const database = createDatabase({
    'meetings/ABCD2345': {
      hostUid: 'host-1',
      coHosts: [],
      locked: false,
      hasPassword: true,
    },
    'meetings/ABCD2345/passwordSecret/verifier': passwordVerifier,
  });
  const server = await startServer(database, { now: () => 10_000 });
  t.after(() => server.close());

  const wrong = await server.request('/ABCD2345/authorize', {
    body: { password: 'wrong', uid: 'host-1' },
  });
  assert.equal(wrong.status, 403);
  assert.equal(database.state.has('meetings/ABCD2345/passwordAuthorizations/member-1'), false);

  const correct = await server.request('/ABCD2345/authorize', {
    body: { password: 'correct horse', uid: 'host-1' },
  });
  assert.equal(correct.status, 200);
  assert.deepEqual(database.state.get('meetings/ABCD2345/passwordAuthorizations/member-1'), {
    expiresAt: { millis: 130_000 },
  });
  assert.equal(database.state.has('meetings/ABCD2345/passwordAuthorizations/host-1'), false);
});

test('joining consumes the verified authorization and derives membership from the Firebase UID', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': {
      hostUid: 'host-1',
      coHosts: [],
      locked: false,
      hasPassword: true,
      waitingRoomEnabled: false,
      activeParticipants: ['host-1'],
      waitingParticipants: [],
      allParticipants: ['host-1'],
      startedAt: null,
    },
    'meetings/ABCD2345/passwordAuthorizations/member-1': { expiresAt: { millis: 120_000 } },
  });
  const server = await startServer(database, { now: () => 100_000 });
  t.after(() => server.close());

  const response = await server.request('/ABCD2345/join', {
    body: { uid: 'host-1', participantUid: 'host-1' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { waiting: false });
  assert.deepEqual(database.state.get('meetings/ABCD2345').activeParticipants, ['host-1', 'member-1']);
  assert.equal(database.state.has('meetings/ABCD2345/passwordAuthorizations/member-1'), false);
  assert.equal(database.state.get('meetings/ABCD2345').allParticipants.includes('host-1'), true);
});

test('joining a protected meeting without a valid authorization is denied', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': {
      hostUid: 'host-1',
      coHosts: [],
      locked: false,
      hasPassword: true,
      waitingRoomEnabled: false,
      activeParticipants: ['host-1'],
      waitingParticipants: [],
      allParticipants: ['host-1'],
    },
    'meetings/ABCD2345/passwordAuthorizations/member-1': { expiresAt: { millis: 99_999 } },
  });
  const server = await startServer(database, { now: () => 100_000 });
  t.after(() => server.close());

  const response = await server.request('/ABCD2345/join', { body: { uid: 'host-1' } });
  assert.equal(response.status, 403);
  assert.deepEqual(database.state.get('meetings/ABCD2345').activeParticipants, ['host-1']);
});

test('open meetings can be joined without a password and repeat joins are idempotent', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': {
      hostUid: 'host-1',
      coHosts: [],
      locked: false,
      hasPassword: false,
      waitingRoomEnabled: false,
      activeParticipants: ['host-1'],
      waitingParticipants: [],
      allParticipants: ['host-1'],
      startedAt: null,
    },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  const first = await server.request('/ABCD2345/join', { body: { uid: 'host-1' } });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { waiting: false });
  assert.deepEqual(database.state.get('meetings/ABCD2345').activeParticipants, ['host-1', 'member-1']);

  const repeated = await server.request('/ABCD2345/join');
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { waiting: false });
  assert.deepEqual(database.state.get('meetings/ABCD2345').activeParticipants, ['host-1', 'member-1']);
});

test('expired and replayed protected-meeting authorizations are denied', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': {
      hostUid: 'host-1',
      coHosts: [],
      locked: false,
      hasPassword: true,
      waitingRoomEnabled: false,
      activeParticipants: ['host-1'],
      waitingParticipants: [],
      allParticipants: ['host-1'],
    },
    'meetings/ABCD2345/passwordAuthorizations/member-1': { expiresAt: { millis: 99_999 } },
  });
  const server = await startServer(database, { now: () => 100_000 });
  t.after(() => server.close());

  assert.equal((await server.request('/ABCD2345/join')).status, 403);
  database.state.set('meetings/ABCD2345/passwordAuthorizations/member-1', { expiresAt: { millis: 120_000 } });
  assert.equal((await server.request('/ABCD2345/join')).status, 200);
  assert.equal(database.state.has('meetings/ABCD2345/passwordAuthorizations/member-1'), false);
  database.state.get('meetings/ABCD2345').activeParticipants = ['host-1'];
  database.state.get('meetings/ABCD2345').allParticipants = ['host-1'];
  assert.equal((await server.request('/ABCD2345/join')).status, 403);
});

test('legacy password hashes remain server-verified and waiting-room re-entry is preserved', async (t) => {
  const legacyHash = createHash('sha256').update('legacy password', 'utf8').digest('hex');
  const database = createDatabase({
    'meetings/ABCD2345': {
      hostUid: 'host-1',
      coHosts: [],
      locked: false,
      passwordHash: legacyHash,
      waitingRoomEnabled: true,
      activeParticipants: ['host-1'],
      waitingParticipants: [],
      allParticipants: ['host-1'],
    },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  assert.equal(await verifyMeetingPassword('legacy password', { passwordHash: legacyHash }), true);
  assert.equal(await verifyMeetingPassword('legacy password', {
    algorithm: 'unsupported',
    version: 1,
    passwordHash: legacyHash,
  }), false);
  assert.equal((await server.request('/ABCD2345/authorize', {
    body: { password: 'legacy password' },
  })).status, 200);
  assert.equal('passwordHash' in database.state.get('meetings/ABCD2345'), false);
  assert.equal(database.state.get('meetings/ABCD2345/passwordSecret/verifier').algorithm, 'scrypt');
  const firstJoin = await server.request('/ABCD2345/join', { body: { uid: 'host-1' } });
  assert.equal(firstJoin.status, 200);
  assert.deepEqual(await firstJoin.json(), { waiting: true });
  assert.deepEqual(database.state.get('meetings/ABCD2345').waitingParticipants, ['member-1']);

  const rejoin = await server.request('/ABCD2345/join', { body: { uid: 'host-1' } });
  assert.equal(rejoin.status, 200);
  assert.deepEqual(await rejoin.json(), { waiting: true });
});

test('locked, missing-secret, and malformed meeting authorization requests fail closed', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': { hostUid: 'host-1', locked: true, hasPassword: true },
    'meetings/EFGH2345': { hostUid: 'host-1', locked: false, hasPassword: true },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  assert.equal((await server.request('/ABCD2345/authorize', { body: { password: 'secret' } })).status, 423);
  assert.equal((await server.request('/EFGH2345/authorize', { body: { password: 'secret' } })).status, 503);
  assert.equal((await server.request('/bad/authorize', { body: { password: 'secret' } })).status, 400);
  assert.equal((await server.request('/ABCD2345/authorize', { body: { password: '' } })).status, 400);
});

test('password guessing is rate limited per authenticated account and meeting', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': { hostUid: 'host-1', locked: false, hasPassword: true },
    'meetings/ABCD2345/passwordSecret/verifier': { algorithm: 'scrypt', version: 1 },
  });
  const server = await startServer(database, {
    dependencies: { verifyMeetingPassword: async () => false },
  });
  t.after(() => server.close());

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await server.request('/ABCD2345/authorize', { body: { password: 'wrong' } })).status, 403);
  }
  assert.equal((await server.request('/ABCD2345/authorize', { body: { password: 'wrong' } })).status, 429);
});

test('concurrent password attempts enforce the per-user rate limit transactionally', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': { hostUid: 'host-1', locked: false, hasPassword: true },
    'meetings/ABCD2345/passwordSecret/verifier': {
      algorithm: 'scrypt',
      version: 1,
      salt: 'test',
      verifier: 'test',
    },
  });
  const server = await startServer(database, {
    dependencies: { verifyMeetingPassword: async () => false },
  });
  t.after(() => server.close());

  const responses = await Promise.all(Array.from({ length: 12 }, () => server.request(
    '/ABCD2345/authorize',
    { body: { password: 'wrong' } }
  )));
  const statuses = responses.map((response) => response.status).sort();
  assert.deepEqual(statuses, [403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 429, 429]);
  assert.equal(database.state.get('meetings/ABCD2345/passwordAttempts/member-1').count, 10);
});

test('host kicks revoke active and waiting membership before removing the LiveKit participant', async (t) => {
  const database = createDatabase({
    'meetings/ABCD2345': {
      hostUid: 'host-1',
      coHosts: [],
      activeParticipants: ['host-1', 'member-1'],
      waitingParticipants: ['guest-1'],
      allParticipants: ['host-1', 'member-1', 'guest-1'],
    },
  });
  const kicked = [];
  const server = await startServer(database, {
    dependencies: {
      kickParticipant: async (...args) => kicked.push(args),
    },
  });
  t.after(() => server.close());

  assert.equal((await server.request('/ABCD2345/kick', {
    body: { identity: 'member-1' },
  })).status, 403);
  assert.deepEqual(database.state.get('meetings/ABCD2345').activeParticipants, ['host-1', 'member-1']);

  assert.equal((await server.request('/ABCD2345/kick', {
    token: 'host',
    body: { identity: 'member-1' },
  })).status, 200);
  assert.deepEqual(database.state.get('meetings/ABCD2345').activeParticipants, ['host-1']);
  assert.deepEqual(database.state.get('meetings/ABCD2345').waitingParticipants, ['guest-1']);
  assert.deepEqual(database.state.get('meetings/ABCD2345').allParticipants, ['host-1', 'member-1', 'guest-1']);
  assert.deepEqual(kicked, [['ABCD2345', 'member-1']]);

  assert.equal((await server.request('/ABCD2345/kick', {
    token: 'host',
    body: { identity: 'member-1' },
  })).status, 200);
  assert.deepEqual(kicked, [['ABCD2345', 'member-1'], ['ABCD2345', 'member-1']]);

  assert.equal((await server.request('/ABCD2345/kick', {
    token: 'host',
    body: { identity: 'host-1' },
  })).status, 400);
});
