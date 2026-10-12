import type { Timestamp } from 'firebase/firestore';

/**
 * Firestore returns Timestamp OBJECTS (or null while a serverTimestamp() write
 * is still pending). The rest of the app compares plain epoch milliseconds, so
 * every conversion happens here, once — which keeps every "is this unread?"
 * check a number-vs-number comparison.
 */
export function toMillis(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value && typeof (value as Timestamp).toMillis === 'function') return (value as Timestamp).toMillis();
  return 0;
}

/** { uid: Timestamp | number | null } -> { uid: epoch ms } */
export function timestampMapToMillis(map: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!map || typeof map !== 'object') return result;
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    result[key] = toMillis(value);
  }
  return result;
}

/** The fields of a chat or group that decide whether it has something unread for me. */
export interface ReadMeta {
  lastMessageAt: number;
  lastMessageSenderId?: string | null;
  lastReadAt?: Record<string, number> | null;
}

/**
 * Unread = the newest message is newer than MY read marker, and it is not mine.
 * Scoped to one user: every member has their own entry in lastReadAt.
 */
export function hasUnread(meta: ReadMeta | null | undefined, uid: string): boolean {
  if (!meta || !meta.lastMessageAt) return false; // nothing has been sent yet
  if (meta.lastMessageSenderId === uid) return false; // my own message is never "unread" to me
  const readAt = meta.lastReadAt?.[uid] ?? 0;
  return meta.lastMessageAt > readAt;
}

/**
 * Decides whether a "mark as read" write is needed right now.
 * Returns a marker string to remember (so the same message is never marked
 * twice, even if the device clock makes the local read time look older than
 * the message), or null when nothing needs to be written.
 */
export function getPendingReadMark(
  conversationId: string,
  uid: string,
  meta: ReadMeta | null | undefined,
  alreadyMarked: string
): string | null {
  if (!meta || !hasUnread(meta, uid)) return null;
  const key = `${conversationId}:${meta.lastMessageAt}`;
  return key === alreadyMarked ? null : key;
}