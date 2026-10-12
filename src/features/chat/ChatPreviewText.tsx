import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getPrivateKey } from '../../services/secureKeyStore';
import { getSharedKeyForChat, decryptForChat } from './e2ee';
import { neutralizePreview } from './previewText';
import type { Chat } from './chatTypes';

// decryptForChat() returns a "⚠️ Could not decrypt..." sentinel instead of throwing — never show that as a preview.
const DECRYPT_FAILED_PREFIX = '⚠️ Could not decrypt';
const MAX_CACHED_PREVIEWS = 200;
const MAX_PREVIEW_CHARS = 120;

// Memory only (gone on reload). Keyed by chat + IV, so a new message never reuses an old preview.
const previewCache = new Map<string, string>();

let cachedKeyUid: string | null = null;
let cachedPrivateKey: CryptoKey | null = null;

/**
 * Read-only: this NEVER creates or replaces keys (ensureDeviceKeys does that,
 * and a chat-list row has no business doing it). No key -> no preview -> fallback.
 */
async function loadPrivateKey(uid: string): Promise<CryptoKey | null> {
  if (cachedKeyUid === uid && cachedPrivateKey) return cachedPrivateKey;
  const key = await getPrivateKey(uid).catch(() => null);
  if (key) {
    cachedKeyUid = uid;
    cachedPrivateKey = key;
  }
  return key;
}

function rememberPreview(cacheKey: string, text: string) {
  if (previewCache.size >= MAX_CACHED_PREVIEWS) {
    const oldest = previewCache.keys().next().value;
    if (oldest !== undefined) previewCache.delete(oldest);
  }
  previewCache.set(cacheKey, text);
}

/**
 * Drop-in replacement for `{chat.lastMessage}` in the chat list.
 * Plain (unencrypted) previews render as before. Encrypted ones are decrypted
 * ON THIS DEVICE from the ciphertext stored on the chat document; if that is
 * not possible the row shows a plain "Message" instead of an explanatory label.
 */
export function ChatPreviewText({ chat }: { chat: Chat }) {
  const { profile } = useAuth();
  const uid = profile?.uid;
  const cipher = chat.lastMessageCipher ?? null;
  const iv = chat.lastMessageIv ?? null;
  const cacheKey = cipher && iv ? `${chat.id}:${iv}` : null;
  const otherUid = chat.participants.find((participant) => participant !== uid);

  const [decrypted, setDecrypted] = useState<string | null>(() => (cacheKey ? previewCache.get(cacheKey) ?? null : null));

  useEffect(() => {
    if (!uid || !otherUid || !cipher || !iv || !cacheKey) {
      setDecrypted(null);
      return;
    }
    const cached = previewCache.get(cacheKey);
    if (cached !== undefined) {
      setDecrypted(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const privateKey = await loadPrivateKey(uid);
        if (!privateKey) return;
        const sharedKey = await getSharedKeyForChat(privateKey, otherUid);
        if (!sharedKey) return;
        const plaintext = await decryptForChat(sharedKey, { ciphertext: cipher, iv });
        if (plaintext.startsWith(DECRYPT_FAILED_PREFIX)) return;
        const preview = plaintext.replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW_CHARS);
        rememberPreview(cacheKey, preview);
        if (!cancelled) setDecrypted(preview);
      } catch {
        // leave the fallback in place — never log message content
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, otherUid, cipher, iv, cacheKey]);

  return <>{decrypted ?? neutralizePreview(chat.lastMessage)}</>;
}