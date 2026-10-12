/** What older builds stored in `lastMessage` for every encrypted message. */
export const LEGACY_ENCRYPTED_LABEL = '🔒 Encrypted message';

/** Shown when a preview can't be decrypted on this device. Deliberately plain. */
export const ENCRYPTED_PREVIEW_FALLBACK = 'Message';

/** Old documents still contain the legacy label — never show it in a list. */
export function neutralizePreview(lastMessage: string): string {
  return lastMessage === LEGACY_ENCRYPTED_LABEL ? ENCRYPTED_PREVIEW_FALLBACK : lastMessage;
}