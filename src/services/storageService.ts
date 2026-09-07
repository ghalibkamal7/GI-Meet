import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';
import { appConfig } from '../config/appConfig';

export interface UploadResult {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
}

export function validateFile(file: File): { valid: boolean; message?: string } {
  const isImage = file.type.startsWith('image/');
  const maxMB = isImage ? appConfig.upload.maxImageSizeMB : appConfig.upload.maxFileSizeMB;

  if (!appConfig.upload.allowedFileTypes.includes(file.type as never) && !isImage) {
    return { valid: false, message: `File type "${file.type || 'unknown'}" isn't supported.` };
  }
  if (file.size > maxMB * 1024 * 1024) {
    return { valid: false, message: `File is too large. Max size is ${maxMB}MB.` };
  }
  return { valid: true };
}

/**
 * Uploads a file to a scoped storage path with progress reporting.
 * `pathPrefix` examples: `chats/{chatId}`, `groups/{groupId}`, `profile-photos/{uid}`.
 * Storage security rules (storage.rules) enforce who can actually write to each prefix.
 */
export function uploadFile(
  file: File,
  pathPrefix: string,
  onProgress?: (percent: number) => void
): { promise: Promise<UploadResult>; cancel: () => void } {
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  const storageRef = ref(storage, `${pathPrefix}/${safeName}`);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

  const promise = new Promise<UploadResult>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        const percent = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(percent);
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ url, name: file.name, sizeBytes: file.size, mimeType: file.type });
      }
    );
  });

  return { promise, cancel: () => task.cancel() };
}
