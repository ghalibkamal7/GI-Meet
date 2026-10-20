import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSharedKey,
  decryptTextWithDiagnostics,
  encryptText,
  exportPublicKey,
  generateKeyPair,
} from '../src/services/cryptoService.ts';
import {
  createEncryptedDeviceKeyTransfer,
  importEncryptedDeviceKeyTransfer,
} from '../src/features/chat/deviceKeyTransfer.ts';

test('securely enrolls a second device and preserves compatible chat encryption', async () => {
  const accountDevice = await generateKeyPair();
  const newDevicePeer = await generateKeyPair();
  const registeredPublicKey = await exportPublicKey(accountDevice.publicKey);
  const transfer = await createEncryptedDeviceKeyTransfer(accountDevice.privateKey);
  const importedPrivateKey = await importEncryptedDeviceKeyTransfer(
    transfer.payload,
    transfer.passphrase,
    registeredPublicKey
  );

  const encryptedMessage = await encryptText(
    await deriveSharedKey(newDevicePeer.privateKey, accountDevice.publicKey),
    'encrypted compatibility check'
  );
  assert.deepEqual(Object.keys(encryptedMessage).sort(), ['ciphertext', 'iv']);
  assert.equal(
    await decryptTextWithDiagnostics(
      await deriveSharedKey(importedPrivateKey, newDevicePeer.publicKey),
      encryptedMessage
    ),
    'encrypted compatibility check'
  );
});

test('transfer rejects a wrong passphrase and a different account key', async () => {
  const accountDevice = await generateKeyPair();
  const unrelatedAccount = await generateKeyPair();
  const transfer = await createEncryptedDeviceKeyTransfer(accountDevice.privateKey);

  await assert.rejects(
    importEncryptedDeviceKeyTransfer(transfer.payload, `${transfer.passphrase}x`, await exportPublicKey(accountDevice.publicKey)),
    /transfer text and passphrase/
  );
  await assert.rejects(
    importEncryptedDeviceKeyTransfer(transfer.payload, transfer.passphrase, await exportPublicKey(unrelatedAccount.publicKey)),
    /does not match this account/
  );
});

test('transfer rejects payload tampering through AES-GCM authentication', async () => {
  const accountDevice = await generateKeyPair();
  const registeredPublicKey = await exportPublicKey(accountDevice.publicKey);
  const transfer = await createEncryptedDeviceKeyTransfer(accountDevice.privateKey);
  const tampered = JSON.parse(transfer.payload);
  tampered.iv = `${tampered.iv[0] === 'A' ? 'B' : 'A'}${tampered.iv.slice(1)}`;

  await assert.rejects(
    importEncryptedDeviceKeyTransfer(JSON.stringify(tampered), transfer.passphrase, registeredPublicKey),
    /Could not decrypt the transfer/
  );
});

test('transfer rejects malformed payloads before key import', async () => {
  const accountDevice = await generateKeyPair();
  const registeredPublicKey = await exportPublicKey(accountDevice.publicKey);
  const transfer = await createEncryptedDeviceKeyTransfer(accountDevice.privateKey);
  const payload = JSON.parse(transfer.payload);

  await assert.rejects(
    importEncryptedDeviceKeyTransfer('{not-json', transfer.passphrase, registeredPublicKey),
    /Could not decrypt the transfer/
  );
  await assert.rejects(
    importEncryptedDeviceKeyTransfer(JSON.stringify({ ...payload, version: 99 }), transfer.passphrase, registeredPublicKey),
    /Could not decrypt the transfer/
  );
  await assert.rejects(
    importEncryptedDeviceKeyTransfer(JSON.stringify({ ...payload, ciphertext: 'invalid!' }), transfer.passphrase, registeredPublicKey),
    /Could not decrypt the transfer/
  );
});
