import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { createVerifyFirebaseAuth } from '../src/middleware/createVerifyFirebaseAuth.js';
import { createInvitationRouter } from '../src/routes/invitationRouter.js';

const ARRAY_UNION = Symbol('arrayUnion');

function snapshot(ref, data) {
  return {
    id: ref.id,
    ref,
    exists: data !== undefined,
    data: () => data,
  };
}

function createDatabase(seed = {}) {
  const state = {
    users: new Map(Object.entries(seed.users ?? {})),
    groups: new Map(Object.entries(seed.groups ?? {})),
    communities: new Map(Object.entries(seed.communities ?? {})),
  };
  const failures = new Set();
  let transactionFailure = false;

  function makeRef(collectionName, id) {
    return {
      collectionName,
      id,
      key: `${collectionName}/${id}`,
      get: async () => {
        if (failures.has(`get:${collectionName}/${id}`)) throw new Error('injected firestore read failure');
        return snapshot(makeRef(collectionName, id), state[collectionName].get(id));
      },
    };
  }

  const db = {
    collection(collectionName) {
      return {
        doc: (id) => makeRef(collectionName, id),
        where(field, operator, value) {
          assert.equal(field, 'inviteCode');
          assert.equal(operator, '==');
          return {
            limit() {
              return {
                get: async () => {
                  if (failures.has(`query:${collectionName}`)) {
                    throw new Error('injected firestore query failure');
                  }
                  const match = [...state[collectionName].entries()]
                    .find(([, data]) => data.inviteCode === value);
                  if (!match) return { empty: true, docs: [] };
                  const [id, data] = match;
                  return { empty: false, docs: [snapshot(makeRef(collectionName, id), data)] };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(callback) {
      if (transactionFailure) throw new Error('injected firestore transaction failure');
      const updates = [];
      const transaction = {
        get: async (ref) => {
          if (failures.has(`transactionGet:${ref.key}`)) {
            throw new Error('injected transaction read failure');
          }
          return snapshot(ref, state[ref.collectionName].get(ref.id));
        },
        update: (ref, fields) => updates.push({ ref, fields }),
      };
      const result = await callback(transaction);
      for (const { ref, fields } of updates) {
        const current = state[ref.collectionName].get(ref.id);
        if (!current) throw new Error('document does not exist');
        for (const [field, value] of Object.entries(fields)) {
          if (value?.kind === ARRAY_UNION) {
            current[field] = [...new Set([...(current[field] ?? []), ...value.values])];
          } else if (field.includes('.')) {
            const [root, key] = field.split('.');
            current[root] = { ...(current[root] ?? {}), [key]: value };
          } else {
            current[field] = value;
          }
        }
      }
      return result;
    },
  };

  return {
    db,
    state,
    failures,
    failTransaction() { transactionFailure = true; },
    arrayUnion(...values) { return { kind: ARRAY_UNION, values }; },
  };
}

async function startServer(database, usersByToken = { valid: { uid: 'member-1', email: 'member@example.test' } }) {
  const authClient = {
    async verifyIdToken(token) {
      const decoded = usersByToken[token];
      if (!decoded) throw new Error('invalid test token');
      return decoded;
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/invitations', createInvitationRouter({
    db: database.db,
    verifyFirebaseAuth: createVerifyFirebaseAuth(authClient),
    arrayUnion: database.arrayUnion,
  }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
    async request(path, { method = 'GET', token = 'valid', body } = {}) {
      const headers = {};
      if (token !== null) headers.authorization = `Bearer ${token}`;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return fetch(`http://127.0.0.1:${address.port}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
  };
}

const user = { displayName: 'Member One', photoURL: 'https://example.test/member.png' };

test('authentication rejects missing and invalid tokens', async (t) => {
  const database = createDatabase({ users: { 'member-1': user } });
  const server = await startServer(database);
  t.after(() => server.close());

  assert.equal((await server.request('/api/invitations/resolve?type=group&code=CODE', { token: null })).status, 401);
  assert.equal((await server.request('/api/invitations/join', {
    method: 'POST', token: 'not-valid', body: { type: 'group', code: 'CODE' },
  })).status, 401);
});

test('missing, malformed, invalid, and rotated invite codes are rejected', async (t) => {
  const database = createDatabase({
    users: { 'member-1': user },
    groups: { team: { inviteCode: 'CURRENT', members: [] } },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  assert.equal((await server.request('/api/invitations/resolve')).status, 400);
  assert.equal((await server.request('/api/invitations/resolve?type=group')).status, 400);
  assert.equal((await server.request('/api/invitations/resolve?type=unknown&code=x')).status, 400);
  assert.equal((await server.request('/api/invitations/resolve?type=group&code=%20%20')).status, 400);
  assert.equal((await server.request('/api/invitations/resolve?type=group&code=INVALID')).status, 404);
  const stale = await server.request('/api/invitations/join', {
    method: 'POST', body: { type: 'group', code: 'PREVIOUS' },
  });
  assert.equal(stale.status, 404);
  assert.deepEqual(database.state.groups.get('team').members, []);
});

test('verified UID is used for group membership, ignoring a client-supplied UID', async (t) => {
  const database = createDatabase({
    users: { 'member-1': user, victim: { displayName: 'Victim' } },
    groups: { team: { inviteCode: 'GROUP-INVITE', members: ['owner'], memberInfo: {} } },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  const response = await server.request('/api/invitations/join', {
    method: 'POST',
    body: { type: 'group', code: 'GROUP-INVITE', uid: 'victim', userId: 'victim' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 'team', alreadyMember: false });
  assert.deepEqual(database.state.groups.get('team').members, ['owner', 'member-1']);
  assert.deepEqual(database.state.groups.get('team').memberInfo['member-1'], user);
  assert.equal(database.state.groups.get('team').memberInfo.victim, undefined);
});

test('private community invite joins the community and its associated announcement group', async (t) => {
  const database = createDatabase({
    users: { 'member-1': user },
    groups: {
      announcements: {
        communityId: 'private-community',
        members: ['owner'],
        memberInfo: {},
      },
    },
    communities: {
      'private-community': {
        inviteCode: 'PRIVATE-INVITE',
        isPublic: false,
        members: ['owner'],
        memberInfo: {},
        groupIds: ['announcements'],
        announcementGroupId: 'announcements',
      },
    },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  const response = await server.request('/api/invitations/join', {
    method: 'POST',
    body: { type: 'community', code: 'PRIVATE-INVITE' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(database.state.communities.get('private-community').members, ['owner', 'member-1']);
  assert.deepEqual(database.state.groups.get('announcements').members, ['owner', 'member-1']);
  assert.deepEqual(database.state.communities.get('private-community').memberInfo['member-1'], user);
  assert.deepEqual(database.state.groups.get('announcements').memberInfo['member-1'], user);
});

test('public community self-join preserves membership and announcement-group behavior', async (t) => {
  const database = createDatabase({
    users: { 'member-1': user },
    groups: { announcements: { communityId: 'public-community', members: [], memberInfo: {} } },
    communities: {
      'public-community': {
        isPublic: true,
        members: [],
        memberInfo: {},
        groupIds: ['announcements'],
        announcementGroupId: 'announcements',
      },
    },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  const response = await server.request('/api/invitations/join', {
    method: 'POST',
    body: { type: 'community', communityId: 'public-community' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(database.state.communities.get('public-community').members, ['member-1']);
  assert.deepEqual(database.state.groups.get('announcements').members, ['member-1']);
});

test('community membership cannot grant access to an unrelated announcement group', async (t) => {
  const database = createDatabase({
    users: { 'member-1': user },
    groups: { private: { communityId: 'different-community', members: ['owner'], memberInfo: {} } },
    communities: {
      malicious: {
        inviteCode: 'PUBLIC-INVITE',
        isPublic: true,
        members: [],
        groupIds: ['private'],
        announcementGroupId: 'private',
      },
    },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  const response = await server.request('/api/invitations/join', {
    method: 'POST',
    body: { type: 'community', code: 'PUBLIC-INVITE' },
  });
  assert.equal(response.status, 409);
  assert.deepEqual(database.state.communities.get('malicious').members, []);
  assert.deepEqual(database.state.groups.get('private').members, ['owner']);
});

test('private community cannot be joined by ID alone', async (t) => {
  const database = createDatabase({
    users: { 'member-1': user },
    communities: { private: { isPublic: false, members: [] } },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  const response = await server.request('/api/invitations/join', {
    method: 'POST',
    body: { type: 'community', communityId: 'private' },
  });
  assert.equal(response.status, 403);
});

test('repeated join requests return existing membership without duplicate changes', async (t) => {
  const database = createDatabase({
    users: { 'member-1': user },
    groups: { team: { inviteCode: 'GROUP-INVITE', members: ['member-1'], memberInfo: {} } },
    communities: { community: { isPublic: true, members: ['member-1'], groupIds: [] } },
  });
  const server = await startServer(database);
  t.after(() => server.close());

  const groupResponse = await server.request('/api/invitations/join', {
    method: 'POST', body: { type: 'group', code: 'GROUP-INVITE' },
  });
  assert.deepEqual(await groupResponse.json(), { id: 'team', alreadyMember: true });
  const communityResponse = await server.request('/api/invitations/join', {
    method: 'POST', body: { type: 'community', communityId: 'community' },
  });
  assert.deepEqual(await communityResponse.json(), { id: 'community', alreadyMember: true });
  assert.deepEqual(database.state.groups.get('team').members, ['member-1']);
  assert.deepEqual(database.state.communities.get('community').members, ['member-1']);
});

test('missing profiles and Firestore failures fail closed with explicit HTTP errors', async (t) => {
  const missingProfileDb = createDatabase({
    groups: { team: { inviteCode: 'GROUP-INVITE', members: [] } },
  });
  const missingProfileServer = await startServer(missingProfileDb);
  t.after(() => missingProfileServer.close());
  assert.equal((await missingProfileServer.request('/api/invitations/join', {
    method: 'POST', body: { type: 'group', code: 'GROUP-INVITE' },
  })).status, 403);

  const failedLookupDb = createDatabase({ users: { 'member-1': user } });
  failedLookupDb.failures.add('query:groups');
  const failedLookupServer = await startServer(failedLookupDb);
  t.after(() => failedLookupServer.close());
  assert.equal((await failedLookupServer.request('/api/invitations/join', {
    method: 'POST', body: { type: 'group', code: 'GROUP-INVITE' },
  })).status, 500);
  assert.equal((await failedLookupServer.request('/api/invitations/resolve?type=group&code=GROUP-INVITE')).status, 500);

  const failedProfileDb = createDatabase({ users: { 'member-1': user }, groups: { team: { inviteCode: 'GROUP-INVITE' } } });
  failedProfileDb.failures.add('get:users/member-1');
  const failedProfileServer = await startServer(failedProfileDb);
  t.after(() => failedProfileServer.close());
  assert.equal((await failedProfileServer.request('/api/invitations/join', {
    method: 'POST', body: { type: 'group', code: 'GROUP-INVITE' },
  })).status, 500);

  const failedTransactionDb = createDatabase({
    users: { 'member-1': user },
    groups: { team: { inviteCode: 'GROUP-INVITE', members: [] } },
  });
  failedTransactionDb.failTransaction();
  const failedTransactionServer = await startServer(failedTransactionDb);
  t.after(() => failedTransactionServer.close());
  assert.equal((await failedTransactionServer.request('/api/invitations/join', {
    method: 'POST', body: { type: 'group', code: 'GROUP-INVITE' },
  })).status, 500);
  assert.deepEqual(failedTransactionDb.state.groups.get('team').members, []);
});
