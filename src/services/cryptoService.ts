export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64, 12 bytes
}

export type MessageDecryptionFailure =
  | 'key-unavailable'
  | 'malformed-payload'
  | 'authentication-failed'
  | 'decryption-failed';

export class MessageDecryptionError extends Error {
  readonly reason: MessageDecryptionFailure;

  constructor(reason: MessageDecryptionFailure) {
    super(reason);
    this.name = 'MessageDecryptionError';
    this.reason = reason;
  }
}

export function messageDecryptionFallback(error: unknown): string {
  if (!(error instanceof MessageDecryptionError)) return '⚠️ Could not decrypt this message.';
  switch (error.reason) {
    case 'key-unavailable':
      return '🔒 Encrypted message (key unavailable)';
    case 'malformed-payload':
      return '⚠️ Encrypted message data is malformed.';
    case 'authentication-failed':
      return '⚠️ Could not decrypt: the key may not match or the message data may be damaged.';
    case 'decryption-failed':
      return '⚠️ Could not decrypt this message.';
  }
}

export function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']) as Promise<CryptoKeyPair>;
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return JSON.stringify(jwk);
}

export async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

export async function deriveSharedKey(myPrivateKey: CryptoKey, theirPublicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { ciphertext: toBase64(ciphertextBuffer), iv: toBase64(iv.buffer) };
}

export async function decryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.ciphertext)
  );
  return new TextDecoder().decode(plainBuffer);
}

export async function decryptTextWithDiagnostics(
  key: CryptoKey | null,
  payload: EncryptedPayload
): Promise<string> {
  if (!key) throw new MessageDecryptionError('key-unavailable');

  let iv: ArrayBuffer;
  let ciphertext: ArrayBuffer;
  try {
    if (
      typeof payload?.iv !== 'string' ||
      typeof payload?.ciphertext !== 'string' ||
      !payload.iv ||
      !payload.ciphertext
    ) {
      throw new Error('Missing encrypted payload fields.');
    }
    const decode = (value: string): ArrayBuffer => {
      const decoded = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
      const buffer = new ArrayBuffer(decoded.byteLength);
      new Uint8Array(buffer).set(decoded);
      return buffer;
    };
    iv = decode(payload.iv);
    ciphertext = decode(payload.ciphertext);
    if (iv.byteLength !== 12 || ciphertext.byteLength < 16) {
      throw new Error('Invalid encrypted payload length.');
    }
  } catch {
    throw new MessageDecryptionError('malformed-payload');
  }

  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'OperationError') {
      throw new MessageDecryptionError('authentication-failed');
    }
    throw new MessageDecryptionError('decryption-failed');
  }
}

// --- Group E2EE support: a raw symmetric key that gets "wrapped" (encrypted)
// individually per member, rather than a key pair. ---------------------------

export async function generateGroupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportRawKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key);
}

export async function importRawAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Byte-level encrypt/decrypt — used to "wrap" a group's raw key material for a specific member, and for file/media encryption. */
export async function encryptBytes(key: CryptoKey, data: ArrayBuffer): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { ciphertext: toBase64(ciphertextBuffer), iv: toBase64(iv.buffer) };
}

export async function decryptBytes(key: CryptoKey, payload: EncryptedPayload): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.ciphertext));
}