export const PROFILE_PHOTO_MAX_MB = 5;
export const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Returns a user-facing problem description, or null when the file is acceptable. */
export function validateProfilePhoto(file: { type: string; size: number }): string | null {
  if (!PROFILE_PHOTO_TYPES.includes(file.type)) return 'Please choose a JPG, PNG or WebP image.';
  if (file.size === 0) return 'That file is empty. Please choose another image.';
  if (file.size > PROFILE_PHOTO_MAX_MB * 1024 * 1024) {
    return `That image is larger than ${PROFILE_PHOTO_MAX_MB} MB. Please choose a smaller one.`;
  }
  return null;
}