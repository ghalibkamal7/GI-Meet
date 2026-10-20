import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import {
  generateKeyPair,
  importPublicKey,
  deriveSharedKey,
  encryptText,
  decryptBytes,
  decryptTextWithDiagnostics,
  toBase64,
  type EncryptedPayload,
} from '../../services/cryptoService';
import { getPrivateKey, savePrivateKeyIfAbsent } from '../../services/secureKeyStore';
import { registerUserPublicKeyIfAbsent } from '../../services/userService';
import { decideDeviceKeyAction, publicKeysMatch } from './deviceKeyPolicy';

export {
  MessageDecryptionError,
  messageDecryptionFallback,
  type MessageDecryptionFailure,
} from '../../services/cryptoService';

const sharedKeyCache = new WeakMap<CryptoKey, Map<string, { publicKeyJwk: string; sharedKey: CryptoKey }>>();
const deviceKeyTasks = new Map<string, Promise<CryptoKey>>();

export class DeviceEncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceEncryptionKeyError';
  }
}

export class DeviceEncryptionKeyStorageError extends Error {
  constructor() {
    super('Could not access this device’s encryption-key storage. No key was changed. Check device storage availability and retry.');
    this.name = 'DeviceEncryptionKeyStorageError';
  }
}

async function exportPublicKeyForPrivateKey(privateKey: CryptoKey): Promise<string> {
  const jwk: Record<string, unknown> = { ...await crypto.subtle.exportKey('jwk', privateKey) };
  delete jwk.d;
  jwk.key_ops = [];
  return JSON.stringify(jwk);
}

function publishedKey(data: Record<string, unknown> | undefined): string | null {
  return typeof data?.publicKeyJwk === 'string' && data.publicKeyJwk.trim()
    ? data.publicKeyJwk
    : null;
}

export async function ensureDeviceKeys(uid: string): Promise<CryptoKey> {
  const pending = deviceKeyTasks.get(uid);
  if (pending) return pending;

  const task = (async () => {
    let privateKey: CryptoKey | null;
    try {
      privateKey = await getPrivateKey(uid);
    } catch {
      throw new DeviceEncryptionKeyStorageError();
    }
    const userSnapshot = await getDoc(doc(db, 'users', uid));
    const remotePublicKey = publishedKey(userSnapshot.data());
    const localPublicKey = privateKey ? await exportPublicKeyForPrivateKey(privateKey) : null;
    const action = decideDeviceKeyAction(Boolean(privateKey), localPublicKey, remotePublicKey);

    if (action === 'restore-missing-key') {
      throw new DeviceEncryptionKeyError(
        'This device is missing the encryption key registered to your account. GI Meet will not replace it, because doing so could make existing messages unreadable. Restore the original browser or device data to access encrypted messages.'
      );
    }
    if (action === 'resolve-key-mismatch') {
      throw new DeviceEncryptionKeyError(
        'This device encryption key does not match the key registered to your account. The key was not replaced; restore the matching device key to access encrypted messages.'
      );
    }
    if (action === 'use-local-key') return privateKey!;

    if (action === 'create-initial-key') {
      try {
        const candidate = await generateKeyPair();
        privateKey = await savePrivateKeyIfAbsent(uid, candidate.privateKey);
      } catch {
        throw new DeviceEncryptionKeyStorageError();
      }
      const candidatePublicKey = await exportPublicKeyForPrivateKey(privateKey);
      await registerUserPublicKeyIfAbsent(uid, candidatePublicKey);
      const latest = await getDoc(doc(db, 'users', uid));
      if (!publicKeysMatch(candidatePublicKey, publishedKey(latest.data()))) {
        throw new DeviceEncryptionKeyError(
          'Another device registered a different encryption key first. Keep that device’s key and use its secure transfer option to enroll this device.'
        );
      }
      return privateKey;
    }

    await registerUserPublicKeyIfAbsent(uid, localPublicKey!);
    const latest = await getDoc(doc(db, 'users', uid));
    if (!publicKeysMatch(localPublicKey, publishedKey(latest.data()))) {
      throw new DeviceEncryptionKeyError(
        'This device key differs from the account’s registered key. The registered key was not changed; enroll this device using a secure transfer.'
      );
    }
    return privateKey!;
  })();

  deviceKeyTasks.set(uid, task);
  try {
    return await task;
  } finally {
    if (deviceKeyTasks.get(uid) === task) deviceKeyTasks.delete(uid);
  }
}

export async function getSharedKeyForChat(myPrivateKey: CryptoKey, otherUid: string): Promise<CryptoKey | null> {
  const snap = await getDoc(doc(db, 'users', otherUid));
  const publicKeyJwk = publishedKey(snap.data());
  if (!publicKeyJwk) return null;

  let userCache = sharedKeyCache.get(myPrivateKey);
  const cached = userCache?.get(otherUid);
  if (cached?.publicKeyJwk === publicKeyJwk) return cached.sharedKey;

  const theirPublicKey = await importPublicKey(publicKeyJwk);
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
  if (!userCache) {
    userCache = new Map();
    sharedKeyCache.set(myPrivateKey, userCache);
  }
  userCache.set(otherUid, { publicKeyJwk, sharedKey });
  return sharedKey;
}

export async function encryptForChat(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  return encryptText(key, plaintext);
}

export async function decryptForChat(key: CryptoKey | null, payload: EncryptedPayload): Promise<string> {
  return decryptTextWithDiagnostics(key, payload);
}

export async function decryptAttachmentUrl(key: CryptoKey, url: string, iv: string, mimeType: string): Promise<string> {
  const res = await fetch(url);
  const encryptedBuffer = await res.arrayBuffer();
  const decryptedBuffer = await decryptBytes(key, { ciphertext: toBase64(encryptedBuffer), iv });
  const blob = new Blob([decryptedBuffer], { type: mimeType });
  return URL.createObjectURL(blob);
}