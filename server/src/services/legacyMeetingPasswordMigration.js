const LEGACY_HASH_PATTERN = /^[a-f0-9]{64}$/i;

export async function migrateLegacyMeetingPasswordVerifiers({
  db,
  deleteField,
  apply = false,
}) {
  const meetings = await db.collection('meetings').get();
  const result = { scanned: meetings.size, candidates: 0, migrated: 0, unchanged: 0 };
  const candidates = [];

  for (const initialSnapshot of meetings.docs) {
    const initialData = initialSnapshot.data();
    if (typeof initialData.passwordHash !== 'string') {
      result.unchanged += 1;
      continue;
    }
    if (!LEGACY_HASH_PATTERN.test(initialData.passwordHash)) {
      throw new Error('A meeting contains a malformed legacy password verifier; migration stopped without changing it.');
    }
    result.candidates += 1;
    candidates.push({ ref: initialSnapshot.ref, passwordHash: initialData.passwordHash });
  }

  if (!apply) return result;

  for (const candidate of candidates) {
    const verifierRef = candidate.ref.collection('passwordSecret').doc('verifier');
    const verifierSnapshot = await verifierRef.get();
    if (verifierSnapshot.exists) {
      const verifier = verifierSnapshot.data();
      if (verifier.algorithm !== 'legacy-sha256'
        || verifier.version !== 1
        || verifier.passwordHash !== candidate.passwordHash) {
        throw new Error('A meeting has conflicting password verifiers; migration stopped without changing it.');
      }
    }
  }

  for (const candidate of candidates) {
    const outcome = await db.runTransaction(async (transaction) => {
      const meetingSnapshot = await transaction.get(candidate.ref);
      if (!meetingSnapshot.exists) return 'unchanged';
      const meeting = meetingSnapshot.data();
      if (typeof meeting.passwordHash !== 'string') return 'unchanged';
      if (!LEGACY_HASH_PATTERN.test(meeting.passwordHash)) {
        throw new Error('A meeting contains a malformed legacy password verifier; migration stopped without changing it.');
      }

      const transactionVerifierRef = candidate.ref.collection('passwordSecret').doc('verifier');
      const transactionVerifierSnapshot = await transaction.get(transactionVerifierRef);
      if (transactionVerifierSnapshot.exists) {
        const verifier = transactionVerifierSnapshot.data();
        if (verifier.algorithm !== 'legacy-sha256'
          || verifier.version !== 1
          || verifier.passwordHash !== meeting.passwordHash) {
          throw new Error('A meeting has conflicting password verifiers; migration stopped without changing it.');
        }
      } else {
        transaction.create(transactionVerifierRef, {
          algorithm: 'legacy-sha256',
          version: 1,
          passwordHash: meeting.passwordHash,
        });
      }

      transaction.update(candidate.ref, {
        passwordHash: deleteField(),
        hasPassword: true,
      });
      return 'migrated';
    });
    if (outcome === 'migrated') result.migrated += 1;
    else result.unchanged += 1;
  }

  return result;
}
