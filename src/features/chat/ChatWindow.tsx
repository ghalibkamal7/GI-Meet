import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToMessages,
  subscribeToChat,
  sendMessage,
  deleteMessage,
  editMessage,
  toggleReaction,
  toggleStar,
  togglePin,
  setTyping,
  markChatRead,
  isUserBlocked,
  searchMessagesLocally,
} from './chatService';
import { ensureDeviceKeys, getSharedKeyForChat, encryptForChat, decryptForChat, decryptAttachmentUrl } from './e2ee';
import { createCall } from '../calls/callService';
import type { Chat, Message } from './chatTypes';
import { MessageBubble } from '../../components/common/MessageBubble';
import { MessageComposer } from '../../components/common/MessageComposer';
import { ForwardMessageModal } from '../../components/common/ForwardMessageModal';
import { ChatOptionsMenu } from '../../components/common/ChatOptionsMenu';
import { uploadFile, uploadEncryptedFile } from '../../services/storageService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { usePresence } from '../../hooks/usePresence';
import { Search, BarChart3, Phone, Video, MoreVertical, Pin, Lock } from 'lucide-react';
import { subscribeToPolls, type Poll } from '../polls/pollService';
import { PollCard, CreatePollModal } from '../polls/PollComponents';
import { GiAiSummaryButton } from '../gi-ai/GiAiSummaryButton';
import { summarizeConversation } from '../gi-ai/giAiService';
import { useToast } from '../../context/ToastContext';
import { getPendingReadMark, type ReadMeta } from './readState';

export function ChatWindow() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [chat, setChat] = useState<Chat | null>(null);
  const [rawMessages, setRawMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [showPolls, setShowPolls] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);

  useEffect(() => {
    if (!chatId) return;
    getDoc(doc(db, 'chats', chatId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setChat({
          id: snap.id,
          participants: data.participants,
          participantInfo: data.participantInfo,
          lastMessage: data.lastMessage,
          lastMessageAt: data.lastMessageAt?.toMillis?.() ?? 0,
          lastMessageSenderId: data.lastMessageSenderId,
          typing: data.typing ?? {},
          pinnedMessageIds: data.pinnedMessageIds ?? [],
          mutedBy: data.mutedBy ?? [],
          archivedBy: data.archivedBy ?? [],
          hiddenFor: data.hiddenFor ?? [],
          lastReadAt: data.lastReadAt ?? {},
        });
      }
      setLoading(false);
    });

    const unsubscribe = subscribeToMessages(chatId, setRawMessages);
    const unsubPolls = subscribeToPolls('chats', chatId, setPolls);
    return () => {
      unsubscribe();
      unsubPolls();
    };
  }, [chatId]);

  useEffect(() => {
    if (!chat || !profile) return;
    let cancelled = false;
    (async () => {
      const myPrivateKey = await ensureDeviceKeys(profile.uid);
      const otherUid = chat.participants.find((p) => p !== profile.uid);
      const key = otherUid ? await getSharedKeyForChat(myPrivateKey, otherUid) : null;
      if (!cancelled) {
        setSharedKey(key);
        setEncryptionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chat, profile]);

  useEffect(() => {
    if (!encryptionReady) return;
    let cancelled = false;
    const createdUrls: string[] = [];
    (async () => {
      const decrypted = await Promise.all(
        rawMessages.map(async (m) => {
          let text = m.text;
          let replyTo = m.replyTo;
          let attachment = m.attachment;

          if (m.encrypted) {
            text = sharedKey
              ? await decryptForChat(sharedKey, { ciphertext: m.text, iv: m.iv ?? '' })
              : '🔒 Encrypted message (key unavailable)';
          }

          if (replyTo?.iv && sharedKey) {
            try {
              const replyText = await decryptForChat(sharedKey, { ciphertext: replyTo.text, iv: replyTo.iv });
              replyTo = { ...replyTo, text: replyText };
            } catch {
              // Leave the quoted preview as-is if it can't be decrypted for any reason.
            }
          }

          if (attachment?.encrypted && attachment.iv && sharedKey) {
            try {
              const objectUrl = await decryptAttachmentUrl(sharedKey, attachment.url, attachment.iv, attachment.mimeType);
              createdUrls.push(objectUrl);
              attachment = { ...attachment, url: objectUrl };
            } catch {
              // Leave the (undecryptable) original URL — it just won't render correctly, not a crash.
            }
          }

          return { ...m, text, replyTo, attachment };
        })
      );
      if (!cancelled) setMessages(decrypted);
    })();
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [rawMessages, sharedKey, encryptionReady]);

  // --- Read tracking ----------------------------------------------------------
  // Mark the chat as read only while it is really on screen (tab visible), and only when a message
  // newer than MY read marker exists. The live listener means a message that arrives while the chat
  // is open is marked read AFTER we saw it, so my marker is always newer than the sender's lastMessageAt.
  const myUid = profile?.uid;
  const [readMeta, setReadMeta] = useState<ReadMeta | null>(null);
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === 'visible');
  const markedReadRef = useRef('');

  useEffect(() => {
    const onVisibilityChange = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!chatId) return;
    setReadMeta(null);
    return subscribeToChat(chatId, (c) =>
      setReadMeta(c ? { lastMessageAt: c.lastMessageAt, lastMessageSenderId: c.lastMessageSenderId, lastReadAt: c.lastReadAt } : null)
    );
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !myUid || !tabVisible) return;
    const key = getPendingReadMark(chatId, myUid, readMeta, markedReadRef.current);
    if (!key) return;
    markedReadRef.current = key;
    markChatRead(chatId, myUid).catch(() => {
      markedReadRef.current = ''; // let the next change retry
    });
  }, [chatId, myUid, tabVisible, readMeta]);

  useEffect(() => {
    if (!chat || !profile) return;
    const otherUid = chat.participants.find((p) => p !== profile.uid);
    if (otherUid) isUserBlocked(profile.uid, otherUid).then(setBlocked);
  }, [chat, profile]);

  const presence = usePresence(chat?.participants.find((p) => p !== profile?.uid));

  if (loading) return <LoadingSpinner label="Loading chat…" />;
  if (!chat || !profile || !chatId) return <div style={{ padding: 24 }}>Chat not found.</div>;

  const otherUid = chat.participants.find((p) => p !== profile.uid) ?? '';
  const otherInfo = chat.participantInfo[otherUid];
  const isMuted = chat.mutedBy.includes(profile.uid);
  const isArchived = chat.archivedBy.includes(profile.uid);
  const pinnedMessages = messages.filter((m) => chat.pinnedMessageIds.includes(m.id));
  const searchResults = showSearch ? searchMessagesLocally(messages, searchTerm) : [];

  async function handleSend(text: string) {
    let payloadText = text;
    let encrypted = false;
    let iv: string | undefined;
    if (sharedKey) {
      const enc = await encryptForChat(sharedKey, text);
      payloadText = enc.ciphertext;
      encrypted = true;
      iv = enc.iv;
    }

    if (editingMessage) {
      await editMessage(chatId!, editingMessage.id, payloadText, encrypted ? { encrypted: true, iv: iv! } : undefined);
      setEditingMessage(null);
      return;
    }

    let replyToPayload = replyingTo
      ? { messageId: replyingTo.id, text: replyingTo.text, senderId: replyingTo.senderId }
      : undefined;
    if (replyToPayload && sharedKey) {
      const encReply = await encryptForChat(sharedKey, replyToPayload.text);
      replyToPayload = { ...replyToPayload, text: encReply.ciphertext, iv: encReply.iv } as typeof replyToPayload & { iv: string };
    }

    await sendMessage({
      chatId: chatId!,
      senderId: profile!.uid,
      text: payloadText,
      encrypted,
      iv,
      replyTo: replyToPayload,
    });
    setReplyingTo(null);
  }

  async function handleSendFile(file: File) {
    setUploading(true);
    try {
      const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      let result;
      let encrypted = false;
      let iv: string | undefined;

      if (sharedKey) {
        result = await uploadEncryptedFile(file, `chats/${chatId}`, sharedKey);
        encrypted = true;
        iv = result.iv;
      } else {
        const { promise } = uploadFile(file, `chats/${chatId}`);
        result = await promise;
      }

      await sendMessage({
        chatId: chatId!,
        senderId: profile!.uid,
        text: '',
        attachment: { type, url: result.url, name: result.name, sizeBytes: result.sizeBytes, mimeType: result.mimeType, encrypted, iv },
      });
    } catch (err) {
      showToast(err instanceof Error ? `Upload failed: ${err.message}` : 'Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleSendVoice(blob: Blob, durationSeconds: number) {
    setUploading(true);
    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      let result;
      let encrypted = false;
      let iv: string | undefined;

      if (sharedKey) {
        result = await uploadEncryptedFile(file, `chats/${chatId}`, sharedKey);
        encrypted = true;
        iv = result.iv;
      } else {
        const { promise } = uploadFile(file, `chats/${chatId}`);
        result = await promise;
      }

      await sendMessage({
        chatId: chatId!,
        senderId: profile!.uid,
        text: '',
        attachment: { type: 'audio', url: result.url, name: 'Voice message', sizeBytes: result.sizeBytes, mimeType: result.mimeType, durationSeconds, encrypted, iv },
      });
    } catch (err) {
      showToast(err instanceof Error ? `Voice message failed: ${err.message}` : 'Voice message failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleStartCall(type: 'voice' | 'video') {
    if (!profile) return;
    const callId = await createCall({
      callerUid: profile.uid,
      calleeUid: otherUid,
      callerName: profile.displayName,
      calleeName: otherInfo?.displayName ?? 'Unknown',
      type,
    });
    navigate(`/call/${callId}?role=caller`);
  }

  function handleToggleReaction(message: Message, emoji: string) {
    const already = message.reactions[emoji]?.includes(profile!.uid) ?? false;
    toggleReaction(chatId!, message.id, emoji, profile!.uid, already);
  }

  function handleToggleStar(message: Message) {
    toggleStar(chatId!, message.id, profile!.uid, message.starredBy.includes(profile!.uid));
  }

  function handleTogglePin(message: Message) {
    togglePin(chatId!, message.id, chat!.pinnedMessageIds.includes(message.id));
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => navigate(-1)} className="rb-desktop-hide" style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>
          ←
        </button>
        <div>
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {otherInfo?.displayName ?? 'Unknown user'}
            {presence.visible && presence.isOnline && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }} />
            )}
            {sharedKey && (
              <span title="End-to-end encrypted" style={{ display: 'flex', color: 'var(--color-brand-600)' }}>
                <Lock size={12} strokeWidth={1.75} />
              </span>
            )}
          </div>
          {chat.typing[otherUid] ? (
            <div style={{ fontSize: 12, color: 'var(--color-brand-600)' }}>typing…</div>
          ) : presence.visible ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {presence.isOnline ? 'Online' : presence.lastSeen ? `Last seen ${new Date(presence.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </div>
          ) : null}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="rb-btn rb-btn--outline rb-icon-btn" title="Search in chat" onClick={() => setShowSearch((v) => !v)}><Search size={16} strokeWidth={1.75} /></button>
          <button className="rb-btn rb-btn--outline rb-icon-btn" title="Polls" onClick={() => setShowPolls((v) => !v)}><BarChart3 size={16} strokeWidth={1.75} /></button>
          <GiAiSummaryButton onGenerate={() => summarizeConversation('chats', chatId)} />
          <button className="rb-btn rb-btn--outline rb-icon-btn" title="Voice call" onClick={() => handleStartCall('voice')} disabled={blocked}><Phone size={16} strokeWidth={1.75} /></button>
          <button className="rb-btn rb-btn--outline rb-icon-btn" title="Video call" onClick={() => handleStartCall('video')} disabled={blocked}><Video size={16} strokeWidth={1.75} /></button>
          <button className="rb-btn rb-btn--outline rb-icon-btn" title="Options" onClick={() => setShowOptions(true)}><MoreVertical size={16} strokeWidth={1.75} /></button>
        </div>
      </div>

      {showSearch && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <input
            className="rb-input"
            placeholder="Search in this chat..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
          {searchTerm && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {pinnedMessages.length > 0 && !showSearch && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-alt)' }}>
          {pinnedMessages.map((m) => (
            <div key={m.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pin size={13} strokeWidth={1.75} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</span>
            </div>
          ))}
        </div>
      )}

      {showPolls && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', maxHeight: 240, overflowY: 'auto' }}>
          <button className="rb-btn rb-btn--outline" style={{ fontSize: 12, marginBottom: 10 }} onClick={() => setShowCreatePoll(true)}>+ New poll</button>
          {polls.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No polls yet.</p>}
          {polls.map((poll) => (
            <PollCard key={poll.id} poll={poll} parentType="chats" parentId={chatId} currentUid={profile.uid} isCreator={poll.createdBy === profile.uid} />
          ))}
        </div>
      )}

      {blocked && (
        <div style={{ padding: '8px 20px', background: 'var(--color-surface-alt)', fontSize: 13, color: 'var(--color-text-muted)' }}>
          You've blocked this user. Unblock them from Settings to send messages or call.
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {(showSearch && searchTerm ? searchResults : messages).map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.senderId === profile.uid}
            currentUid={profile.uid}
            onReply={setReplyingTo}
            onDelete={(id) => deleteMessage(chatId, id)}
            onEdit={(msg) => setEditingMessage(msg)}
            onForward={(msg) => setForwardingMessage(msg)}
            onToggleReaction={handleToggleReaction}
            onToggleStar={handleToggleStar}
            onTogglePin={handleTogglePin}
            isPinned={chat.pinnedMessageIds.includes(m.id)}
          />
        ))}
        {uploading && <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Uploading…</p>}
      </div>

      {editingMessage && (
        <div style={{ padding: '4px 20px', fontSize: 12, color: 'var(--color-brand-600)' }}>
          Editing message — <button onClick={() => setEditingMessage(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}>cancel</button>
        </div>
      )}

      {!blocked && (
        <MessageComposer
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSend={handleSend}
          onSendFile={handleSendFile}
          onSendVoice={handleSendVoice}
          onTypingChange={(isTyping) => setTyping(chatId, profile.uid, isTyping)}
          placeholder={editingMessage ? 'Edit your message...' : 'Type a message...'}
        />
      )}

      {forwardingMessage && (
        <ForwardMessageModal message={forwardingMessage} onClose={() => setForwardingMessage(null)} />
      )}

      {showCreatePoll && <CreatePollModal parentType="chats" parentId={chatId} createdBy={profile.uid} onClose={() => setShowCreatePoll(false)} />}

      {showOptions && (
        <ChatOptionsMenu
          chatId={chatId}
          currentUid={profile.uid}
          otherUid={otherUid}
          otherName={otherInfo?.displayName ?? "Unknown user"}
          isMuted={isMuted}
          isArchived={isArchived}
          onClose={() => setShowOptions(false)}
          onChatDeleted={() => navigate('/')}
          onBlocked={() => {
            setBlocked(true);
            setShowOptions(false);
          }}
        />
      )}
    </div>
  );
}