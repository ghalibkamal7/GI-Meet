import { collection, getDocs, query, where, writeBatch, type DocumentReference } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { uploadFile } from './storageService';
import { updateProfileFields } from './userService';
import { validateProfilePhoto } from '../utils/profilePhoto';

// Storage folder for avatars. storage.rules must allow the owner to write here (see instructions).
const PROFILE_PHOTO_STORAGE_PREFIX = 'profile-photos';
const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.88;
const BATCH_SIZE = 400;

/**
 * Shrinks the picture to avatar size before upload. As a side effect this
 * re-encodes the image, which also drops EXIF metadata such as GPS location.
 * If anything goes wrong the original file is uploaded unchanged.
 */
async function downscale(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;

    context.fillStyle = '#ffffff'; // transparent PNGs would otherwise turn black in JPEG
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;
    return new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Chats and groups keep a COPY of each member's name/photo (participantInfo /
 * memberInfo). Without refreshing those copies, other screens — and everyone
 * else's chat list — would keep showing the old picture. Best effort: returns
 * true if any of it failed.
 */
async function propagatePhotoToConversations(uid: string, photoURL: string): Promise<boolean> {
  let failed = false;
  try {
    const [chats, groups] = await Promise.all([
      getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', uid))),
      getDocs(query(collection(db, 'groups'), where('members', 'array-contains', uid))),
    ]);

    const updates: Array<{ ref: DocumentReference; data: Record<string, string> }> = [];
    chats.forEach((snap) => updates.push({ ref: snap.ref, data: { [`participantInfo.${uid}.photoURL`]: photoURL } }));
    groups.forEach((snap) => updates.push({ ref: snap.ref, data: { [`memberInfo.${uid}.photoURL`]: photoURL } }));

    for (let start = 0; start < updates.length; start += BATCH_SIZE) {
      const batch = writeBatch(db);
      updates.slice(start, start + BATCH_SIZE).forEach(({ ref, data }) => batch.update(ref, data));
      try {
        await batch.commit();
      } catch {
        failed = true;
      }
    }
  } catch {
    failed = true;
  }
  return failed;
}

/**
 * Upload -> save on the user's profile -> refresh copies in chats/groups.
 * Throws (with a user-facing message) BEFORE anything on the profile changes if
 * the file is invalid or the upload fails, so the previous photo is always kept.
 */
export async function changeProfilePhoto(uid: string, file: File): Promise<{ photoURL: string; copiesNotUpdated: boolean }> {
  const problem = validateProfilePhoto(file);
  if (problem) throw new Error(problem);

  const prepared = await downscale(file);

  let photoURL: string;
  try {
    const { promise } = uploadFile(prepared, `${PROFILE_PHOTO_STORAGE_PREFIX}/${uid}`);
    photoURL = (await promise).url;
  } catch {
    throw new Error('The photo could not be uploaded. Your previous photo was kept.');
  }

  try {
    await updateProfileFields(uid, { photoURL });
  } catch {
    throw new Error('The photo was uploaded but could not be saved to your profile. Your previous photo was kept.');
  }

  const copiesNotUpdated = await propagatePhotoToConversations(uid, photoURL);
  return { photoURL, copiesNotUpdated };
}

// Re-exported so the UI needs a single import.
export { PROFILE_PHOTO_MAX_MB, PROFILE_PHOTO_TYPES } from '../utils/profilePhoto';