import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';
import { appConfig } from '../config/appConfig';
import { encryptBytes, fromBase64 } from './cryptoService';

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

/**
 * Encrypts the file's bytes client-side (AES-GCM, the same key as the
 * chat/group's text messages) before upload — Firebase Storage only ever
 * receives ciphertext. Uploaded with a generic content-type since the
 * stored bytes are no longer a real image/video/etc.
 */
export async function uploadEncryptedFile(
  file: File,
  pathPrefix: string,
  key: CryptoKey,
  onProgress?: (percent: number) => void
): Promise<UploadResult & { iv: string }> {
  const fileBuffer = await file.arrayBuffer();
  const { ciphertext, iv } = await encryptBytes(key, fileBuffer);
  const encryptedFile = new File([fromBase64(ciphertext)], file.name, { type: 'application/octet-stream' });

  const { promise } = uploadFile(encryptedFile, pathPrefix, onProgress);
  const result = await promise;
  return { ...result, name: file.name, mimeType: file.type, iv };
}