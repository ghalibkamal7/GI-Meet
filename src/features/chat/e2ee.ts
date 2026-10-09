import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { generateKeyPair, exportPublicKey, importPublicKey, deriveSharedKey, encryptText, decryptText, decryptBytes, toBase64, type EncryptedPayload } from '../../services/cryptoService';
import { getPrivateKey, savePrivateKey } from '../../services/secureKeyStore';
import { updateUserPublicKey } from '../../services/userService';

const sharedKeyCache = new Map<string, CryptoKey>();

export async function ensureDeviceKeys(uid: string): Promise<CryptoKey> {
  const existing = await getPrivateKey(uid);
  if (existing) return existing;

  const keyPair = await generateKeyPair();
  await savePrivateKey(uid, keyPair.privateKey);
  const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
  await updateUserPublicKey(uid, publicKeyJwk);
  return keyPair.privateKey;
}

export async function getSharedKeyForChat(myPrivateKey: CryptoKey, otherUid: string): Promise<CryptoKey | null> {
  const cached = sharedKeyCache.get(otherUid);
  if (cached) return cached;

  const snap = await getDoc(doc(db, 'users', otherUid));
  const publicKeyJwk = snap.data()?.publicKeyJwk;
  if (!publicKeyJwk) return null;

  const theirPublicKey = await importPublicKey(publicKeyJwk);
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
  sharedKeyCache.set(otherUid, sharedKey);
  return sharedKey;
}

export async function encryptForChat(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  return encryptText(key, plaintext);
}

export async function decryptForChat(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  try {
    return await decryptText(key, payload);
  } catch {
    return '⚠️ Could not decrypt this message.';
  }
}

export async function decryptAttachmentUrl(key: CryptoKey, url: string, iv: string, mimeType: string): Promise<string> {
  const res = await fetch(url);
  const encryptedBuffer = await res.arrayBuffer();
  const decryptedBuffer = await decryptBytes(key, { ciphertext: toBase64(encryptedBuffer), iv });
  const blob = new Blob([decryptedBuffer], { type: mimeType });
  return URL.createObjectURL(blob);
}