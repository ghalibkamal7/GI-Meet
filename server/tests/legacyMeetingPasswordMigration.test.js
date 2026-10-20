import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { migrateLegacyMeetingPasswordVerifiers } from '../src/services/legacyMeetingPasswordMigration.js';
import { verifyMeetingPassword } from '../src/services/meetingPassword.js';

function createDatabase(documents) {
  const state = new Map(Object.entries(documents).map(([path, data]) => [path, structuredClone(data)]));
  const refs = new Map();

  function ref(path) {
    if (!refs.has(path)) {
      refs.set(path, {
        path,
        async get() {
          const data = state.get(path);
          return { exists: data !== undefined, data: () => structuredClone(data) };
        },
        collection(name) {
          return ref(`${path}/${name}`);
        },
        doc(id) {
          return ref(`${path}/${id}`);
        },
      });
    }
    return refs.get(path);
  }

  const db = {
    collection(name) {
      return {
        async get() {
          const prefix = `${name}/`;
          const docs = [...state.entries()]
            .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
            .map(([path, data]) => ({
              ref: ref(path),
              data: () => structuredClone(data),
            }));
          return { size: docs.length, docs };
        },
      };
    },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(reference) {
          const data = state.get(reference.path);
          return { exists: data !== undefined, data: () => structuredClone(data) };
        },
        create(reference, data) {
          writes.push(() => {
            if (state.has(reference.path)) throw new Error('document already exists');
            state.set(reference.path, structuredClone(data));
          });
        },
        update(reference, fields) {
          writes.push(() => {
            const current = state.get(reference.path);
            if (!current) throw new Error('document does not exist');
            for (const [field, value] of Object.entries(fields)) {
              if (value?.kind === 'delete-field') delete current[field];
              else current[field] = structuredClone(value);
            }
          });
        },
      };
      const result = await callback(transaction);
      for (const write of writes) write();
      return result;
    },
  };

  return { db, state };
}

const deleteField = () => ({ kind: 'delete-field' });

test('legacy verifier migration is dry-run by default and does not mutate data', async () => {
  const hash = 'f'.repeat(64);
  const database = createDatabase({ 'meetings/ABCD2345': { passwordHash: hash } });

  const result = await migrateLegacyMeetingPasswordVerifiers({ db: database.db, deleteField });

  assert.deepEqual(result, { scanned: 1, candidates: 1, migrated: 0, unchanged: 0 });
  assert.equal(database.state.get('meetings/ABCD2345').passwordHash, hash);
});

test('migration moves the legacy verifier atomically and is idempotent', async () => {
  const hash = createHash('sha256').update('legacy password', 'utf8').digest('hex');
  const database = createDatabase({
    'meetings/ABCD2345': { passwordHash: hash, hasPassword: false, title: 'Room' },
    'meetings/EFGH2345': { hasPassword: false, title: 'Open room' },
  });

  const first = await migrateLegacyMeetingPasswordVerifiers({
    db: database.db,
    deleteField,
    apply: true,
  });
  assert.deepEqual(first, { scanned: 2, candidates: 1, migrated: 1, unchanged: 1 });
  assert.equal('passwordHash' in database.state.get('meetings/ABCD2345'), false);
  assert.equal(database.state.get('meetings/ABCD2345').hasPassword, true);
  const secret = database.state.get('meetings/ABCD2345/passwordSecret/verifier');
  assert.deepEqual(secret, { algorithm: 'legacy-sha256', version: 1, passwordHash: hash });
  assert.equal(await verifyMeetingPassword('legacy password', secret), true);
  assert.equal(await verifyMeetingPassword('incorrect', secret), false);

  const second = await migrateLegacyMeetingPasswordVerifiers({
    db: database.db,
    deleteField,
    apply: true,
  });
  assert.deepEqual(second, { scanned: 2, candidates: 0, migrated: 0, unchanged: 2 });
});

test('migration stops on malformed or conflicting verifiers without changing that meeting', async () => {
  const database = createDatabase({
    'meetings/AAAA2345': { passwordHash: 'a'.repeat(64) },
    'meetings/ABCD2345': { passwordHash: 'not-a-sha256-digest' },
  });
  await assert.rejects(
    migrateLegacyMeetingPasswordVerifiers({ db: database.db, deleteField, apply: true }),
    /malformed legacy password verifier/
  );
  assert.equal('passwordHash' in database.state.get('meetings/AAAA2345'), true);
  assert.equal(database.state.get('meetings/ABCD2345').passwordHash, 'not-a-sha256-digest');

  const conflicting = createDatabase({
    'meetings/AAAA2345': { passwordHash: 'c'.repeat(64) },
    'meetings/ABCD2345': { passwordHash: 'a'.repeat(64) },
    'meetings/ABCD2345/passwordSecret/verifier': {
      algorithm: 'legacy-sha256',
      version: 1,
      passwordHash: 'b'.repeat(64),
    },
  });
  await assert.rejects(
    migrateLegacyMeetingPasswordVerifiers({ db: conflicting.db, deleteField, apply: true }),
    /conflicting password verifiers/
  );
  assert.equal('passwordHash' in conflicting.state.get('meetings/AAAA2345'), true);
  assert.equal(conflicting.state.get('meetings/ABCD2345').passwordHash, 'a'.repeat(64));
});
