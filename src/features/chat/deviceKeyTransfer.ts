import { publicKeysMatch } from './deviceKeyPolicy.ts';

const TRANSFER_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;

interface DeviceKeyTransfer {
  version: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface EncryptedDeviceKeyTransfer {
  payload: string;
  passphrase: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid transfer data.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function deriveTransferKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createEncryptedDeviceKeyTransfer(privateKey: CryptoKey): Promise<EncryptedDeviceKeyTransfer> {
  const secret = crypto.getRandomValues(new Uint8Array(24));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const passphrase = toBase64Url(secret);
  const key = await deriveTransferKey(passphrase, salt);
  const privateJwk = await crypto.subtle.exportKey('jwk', privateKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(JSON.stringify(privateJwk))
  );

  const payload: DeviceKeyTransfer = {
    version: TRANSFER_VERSION,
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
  return { payload: JSON.stringify(payload), passphrase };
}

export async function privateKeyMatchesRegisteredPublicKey(
  privateKey: CryptoKey,
  registeredPublicKeyJwk: string
): Promise<boolean> {
  const publicJwk: Record<string, unknown> = { ...await crypto.subtle.exportKey('jwk', privateKey) };
  delete publicJwk.d;
  publicJwk.key_ops = [];
  return publicKeysMatch(JSON.stringify(publicJwk), registeredPublicKeyJwk);
}

export async function importEncryptedDeviceKeyTransfer(
  payloadText: string,
  passphrase: string,
  registeredPublicKeyJwk: string
): Promise<CryptoKey> {
  try {
    if (payloadText.length > 8192 || !/^[A-Za-z0-9_-]{32}$/.test(passphrase)) {
      throw new Error('Invalid transfer data.');
    }
    const payload = JSON.parse(payloadText) as Partial<DeviceKeyTransfer>;
    if (
      payload.version !== TRANSFER_VERSION ||
      typeof payload.salt !== 'string' ||
      typeof payload.iv !== 'string' ||
      typeof payload.ciphertext !== 'string' ||
      passphrase.length !== 32
    ) {
      throw new Error('Invalid transfer data.');
    }

    const salt = fromBase64Url(payload.salt);
    const iv = fromBase64Url(payload.iv);
    const ciphertext = fromBase64Url(payload.ciphertext);
    if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 17) {
      throw new Error('Invalid transfer data.');
    }

    const key = await deriveTransferKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext)
    );
    const jwk: unknown = JSON.parse(new TextDecoder().decode(decrypted));
    if (!jwk || typeof jwk !== 'object' || typeof (jwk as JsonWebKey).d !== 'string') {
      throw new Error('Invalid private key data.');
    }

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    if (!await privateKeyMatchesRegisteredPublicKey(privateKey, registeredPublicKeyJwk)) {
      throw new Error('The transferred key does not match this account’s registered encryption key.');
    }
    return privateKey;
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not match this account')) throw error;
    throw new Error('Could not decrypt the transfer. Check the transfer text and passphrase.');
  }
}
