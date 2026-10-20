import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { subscribeToUserChats, sendMessage } from '../../features/chat/chatService';
import { subscribeToUserGroups, sendGroupMessage } from '../../features/groups/groupService';
import { ensureDeviceKeys, getSharedKeyForChat, encryptForChat } from '../../features/chat/e2ee';
import { getMyGroupKey } from '../../features/groups/groupCrypto';
import { uploadEncryptedFile } from '../../services/storageService';
import type { Chat, Message, MessageAttachment } from '../../features/chat/chatTypes';
import type { Group } from '../../features/groups/groupTypes';

async function reuploadAttachmentForDestination(
  attachment: MessageAttachment,
  pathPrefix: string,
  destinationKey: CryptoKey
): Promise<MessageAttachment> {
  const res = await fetch(attachment.url);
  const blob = await res.blob();
  const file = new File([blob], attachment.name, { type: attachment.mimeType });

  const result = await uploadEncryptedFile(file, pathPrefix, destinationKey);
  return { ...attachment, url: result.url, encrypted: true, iv: result.iv };
}

export function ForwardMessageModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const u1 = subscribeToUserChats(profile.uid, setChats);
    const u2 = subscribeToUserGroups(profile.uid, setGroups);
    return () => {
      u1();
      u2();
    };
  }, [profile]);

  async function handleForwardToChat(chat: Chat) {
    if (!profile) return;
    setSendingTo(chat.id);
    try {
      const myPrivateKey = await ensureDeviceKeys(profile.uid);
      const otherUid = chat.participants.find((p) => p !== profile.uid);
      if (!otherUid) throw new Error('This chat does not have a valid second participant.');
      const key = await getSharedKeyForChat(myPrivateKey, otherUid);
      if (!key) throw new Error('The destination chat encryption key is unavailable. Nothing was forwarded.');

      let text = message.text;
      let iv: string | undefined;
      if (message.text) {
        const enc = await encryptForChat(key, message.text);
        text = enc.ciphertext;
        iv = enc.iv;
      }

      const attachment = message.attachment
        ? await reuploadAttachmentForDestination(message.attachment, `chats/${chat.id}`, key)
        : undefined;

      await sendMessage({
        chatId: chat.id,
        senderId: profile.uid,
        text,
        encrypted: true,
        iv,
        attachment,
        forwardedFrom: { senderId: message.senderId, senderName: profile.displayName },
      });
      setSentTo(chat.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not forward the message securely.', 'error');
    } finally {
      setSendingTo(null);
    }
  }

  async function handleForwardToGroup(group: Group) {
    if (!profile) return;
    setSendingTo(group.id);
    try {
      const myPrivateKey = await ensureDeviceKeys(profile.uid);
      const key = await getMyGroupKey(group.id, profile.uid, myPrivateKey);
      if (!key) throw new Error('The destination group encryption key is unavailable. Nothing was forwarded.');

      let text = message.text;
      let iv: string | undefined;
      if (message.text) {
        const enc = await encryptForChat(key, message.text);
        text = enc.ciphertext;
        iv = enc.iv;
      }

      const attachment = message.attachment
        ? await reuploadAttachmentForDestination(message.attachment, `groups/${group.id}`, key)
        : undefined;

      await sendGroupMessage({
        groupId: group.id,
        senderId: profile.uid,
        text,
        encrypted: true,
        iv,
        attachment,
        forwardedFrom: { senderId: message.senderId, senderName: profile.displayName },
      });
      setSentTo(group.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not forward the message securely.', 'error');
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-labelledby="forward-message-title" style={{ width: 360, padding: 20, maxHeight: '70vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 id="forward-message-title" style={{ marginBottom: 12 }}>Forward message</h3>

        {groups.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', margin: '10px 0 4px' }}>Groups</div>}
        {groups.map((g) => (
          <button key={g.id} onClick={() => handleForwardToGroup(g)} style={rowStyle} disabled={sendingTo === g.id}>
            {g.name}
            {sendingTo === g.id && <span style={{ color: 'var(--color-text-muted)' }}>Sending…</span>}
            {sentTo === g.id && <span style={{ color: 'var(--color-brand-600)' }}>Sent ✓</span>}
          </button>
        ))}

        {chats.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', margin: '10px 0 4px' }}>Chats</div>}
        {chats.map((c) => {
          const otherUid = c.participants.find((p) => p !== profile?.uid) ?? '';
          const otherInfo = c.participantInfo[otherUid];
          return (
            <button key={c.id} onClick={() => handleForwardToChat(c)} style={rowStyle} disabled={sendingTo === c.id}>
              {otherInfo?.displayName ?? 'Unknown'}
              {sendingTo === c.id && <span style={{ color: 'var(--color-text-muted)' }}>Sending…</span>}
              {sentTo === c.id && <span style={{ color: 'var(--color-brand-600)' }}>Sent ✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 51, 47, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 150,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  padding: '8px 6px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 14,
};