import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import {
  generateGroupKey,
  exportRawKey,
  importRawAesKey,
  encryptBytes,
  decryptBytes,
  importPublicKey,
  deriveSharedKey,
} from '../../services/cryptoService';

const groupKeyCache = new Map<string, CryptoKey>();

async function fetchPublicKey(uid: string): Promise<CryptoKey | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  const jwk = snap.data()?.publicKeyJwk;
  return jwk ? importPublicKey(jwk) : null;
}

export async function provisionGroupKey(
  groupId: string,
  memberUids: string[],
  creatorUid: string,
  creatorPrivateKey: CryptoKey
): Promise<void> {
  const groupKey = await generateGroupKey();
  const rawKey = await exportRawKey(groupKey);

  await Promise.all(
    memberUids.map(async (memberUid) => {
      const memberPublicKey = await fetchPublicKey(memberUid);
      if (!memberPublicKey) return;
      const pairwiseKey = await deriveSharedKey(creatorPrivateKey, memberPublicKey);
      const wrapped = await encryptBytes(pairwiseKey, rawKey);
      await setDoc(doc(db, 'groups', groupId, 'keys', memberUid), {
        wrappedKey: wrapped.ciphertext,
        iv: wrapped.iv,
        wrappedBy: creatorUid,
      });
    })
  );

  groupKeyCache.set(groupId, groupKey);
}

export async function getMyGroupKey(groupId: string, myUid: string, myPrivateKey: CryptoKey): Promise<CryptoKey | null> {
  const cached = groupKeyCache.get(groupId);
  if (cached) return cached;

  const snap = await getDoc(doc(db, 'groups', groupId, 'keys', myUid));
  if (!snap.exists()) return null;

  const data = snap.data();
  const wrapperPublicKey = await fetchPublicKey(data.wrappedBy);
  if (!wrapperPublicKey) return null;

  const pairwiseKey = await deriveSharedKey(myPrivateKey, wrapperPublicKey);
  const rawKey = await decryptBytes(pairwiseKey, { ciphertext: data.wrappedKey, iv: data.iv });
  const groupKey = await importRawAesKey(rawKey);
  groupKeyCache.set(groupId, groupKey);
  return groupKey;
}

export async function provisionGroupKeyForNewMember(
  groupId: string,
  newMemberUid: string,
  adminUid: string,
  adminPrivateKey: CryptoKey
): Promise<void> {
  const groupKey = await getMyGroupKey(groupId, adminUid, adminPrivateKey);
  if (!groupKey) return;

  const newMemberPublicKey = await fetchPublicKey(newMemberUid);
  if (!newMemberPublicKey) return;

  const rawKey = await exportRawKey(groupKey);
  const pairwiseKey = await deriveSharedKey(adminPrivateKey, newMemberPublicKey);
  const wrapped = await encryptBytes(pairwiseKey, rawKey);
  await setDoc(doc(db, 'groups', groupId, 'keys', newMemberUid), {
    wrappedKey: wrapped.ciphertext,
    iv: wrapped.iv,
    wrappedBy: adminUid,
  });
}