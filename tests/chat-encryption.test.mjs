import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptTextWithDiagnostics,
  encryptText,
  generateGroupKey,
  MessageDecryptionError,
  messageDecryptionFallback,
} from '../src/services/cryptoService.ts';

test('decrypts existing AES-GCM ciphertext with the matching key', async () => {
  const key = await generateGroupKey();
  const encrypted = await encryptText(key, 'test plaintext');
  assert.equal(await decryptTextWithDiagnostics(key, encrypted), 'test plaintext');
});

test('distinguishes unavailable keys and malformed encrypted payloads', async () => {
  await assert.rejects(
    decryptTextWithDiagnostics(null, { ciphertext: 'AA==', iv: 'AA==' }),
    (error) => error instanceof MessageDecryptionError && error.reason === 'key-unavailable'
  );
  await assert.rejects(
    decryptTextWithDiagnostics(await generateGroupKey(), { ciphertext: 'AA==', iv: 'AA==' }),
    (error) => error instanceof MessageDecryptionError && error.reason === 'malformed-payload'
  );
});

test('reports authentication failure without exposing message contents', async () => {
  const originalKey = await generateGroupKey();
  const otherKey = await generateGroupKey();
  const encrypted = await encryptText(originalKey, 'private test content');
  await assert.rejects(
    decryptTextWithDiagnostics(otherKey, encrypted),
    (error) => error instanceof MessageDecryptionError && error.reason === 'authentication-failed'
  );
  assert.match(messageDecryptionFallback(new MessageDecryptionError('authentication-failed')), /key may not match|damaged/);
});
