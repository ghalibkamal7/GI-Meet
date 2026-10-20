import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function createMeetingPasswordVerifier(password) {
  const salt = randomBytes(16);
  const verifier = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return {
    algorithm: 'scrypt',
    version: 1,
    salt: salt.toString('base64url'),
    verifier: verifier.toString('base64url'),
  };
}

export async function verifyMeetingPassword(password, stored) {
  if (stored?.algorithm === 'scrypt' && stored.version === 1) {
    try {
      const salt = Buffer.from(stored.salt, 'base64url');
      const expected = Buffer.from(stored.verifier, 'base64url');
      if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
      const actual = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  const isUnversionedLegacyHash = stored?.algorithm === undefined
    && stored?.version === undefined
    && typeof stored?.passwordHash === 'string'
    && /^[a-f0-9]{64}$/i.test(stored.passwordHash);
  if (isUnversionedLegacyHash || isLegacyMeetingPasswordVerifier(stored)) {
    const actual = createHash('sha256').update(password, 'utf8').digest();
    const expected = Buffer.from(stored.passwordHash, 'hex');
    return timingSafeEqual(actual, expected);
  }

  return false;
}

export function isLegacyMeetingPasswordVerifier(stored) {
  return stored?.algorithm === 'legacy-sha256'
    && stored.version === 1
    && typeof stored.passwordHash === 'string'
    && /^[a-f0-9]{64}$/i.test(stored.passwordHash);
}
