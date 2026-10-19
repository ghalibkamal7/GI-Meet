import { isNativePlatform } from '../utils/platform';
import { getPrivateKey as getWebPrivateKey, savePrivateKey as saveWebPrivateKey } from './keyStore';

// Lazily imported so the web bundle never needs this native-only package
// unless it's actually running on a device.
async function getSecureStoragePlugin() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  return SecureStorage;
}

const PRIVATE_KEY_STORAGE_KEY_PREFIX = 'gi-meet-private-key-';

async function exportPrivateKeyToJwk(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

async function importPrivateKeyFromJwk(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
}

export async function savePrivateKey(uid: string, key: CryptoKey): Promise<void> {
  if (!isNativePlatform()) {
    return saveWebPrivateKey(uid, key);
  }
  const SecureStorage = await getSecureStoragePlugin();
  const jwkString = await exportPrivateKeyToJwk(key);
  await SecureStorage.set(`${PRIVATE_KEY_STORAGE_KEY_PREFIX}${uid}`, jwkString);
}

export async function getPrivateKey(uid: string): Promise<CryptoKey | null> {
  if (!isNativePlatform()) {
    return getWebPrivateKey(uid);
  }
  const SecureStorage = await getSecureStoragePlugin();
  const jwkString = await SecureStorage.get(`${PRIVATE_KEY_STORAGE_KEY_PREFIX}${uid}`);
  if (!jwkString) return null;
  if (typeof jwkString !== 'string') throw new Error('Stored encryption key has an invalid format.');
  return importPrivateKeyFromJwk(jwkString);
}
