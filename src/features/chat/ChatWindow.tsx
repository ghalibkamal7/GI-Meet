import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToMessages,
  subscribeToChat,
  sendMessage,
  loadOlderMessagePage,
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
import {
  ensureDeviceKeys,
  getSharedKeyForChat,
  encryptForChat,
  decryptForChat,
  decryptAttachmentUrl,
  messageDecryptionFallback,
  DeviceEncryptionKeyError,
  DeviceEncryptionKeyStorageError,
} from './e2ee';
import { createCall } from '../calls/callService';
import type { Chat, Message } from './chatTypes';
import { MessageBubble } from '../../components/common/MessageBubble';
import { MessageComposer } from '../../components/common/MessageComposer';
import { ForwardMessageModal } from '../../components/common/ForwardMessageModal';
import { ChatOptionsMenu } from '../../components/common/ChatOptionsMenu';
import { uploadFile, uploadEncryptedFile } from '../../services/storageService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { usePresence } from '../../hooks/usePresence';
import { Search, BarChart3, Phone, Video, MoreVertical, Pin, Lock, ArrowLeft } from 'lucide-react';
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
  const [olderRawMessages, setOlderRawMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [encryptionError, setEncryptionError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatError, setChatError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [showPolls, setShowPolls] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [readMeta, setReadMeta] = useState<ReadMeta | null>(null);
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === 'visible');
  const olderCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const headerMenuRef = useRef<HTMLDetailsElement | null>(null);
  const activeChatIdRef = useRef<string | undefined>(chatId);
  const loadingOlderRef = useRef(false);
  const olderRequestRef = useRef<object | null>(null);
  const chatGenerationRef = useRef(0);
  const markedReadRef = useRef('');

  useEffect(() => {
    activeChatIdRef.current = chatId;
    const generation = ++chatGenerationRef.current;
    if (!chatId) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setChat(null);
    setRawMessages([]);
    setOlderRawMessages([]);
    setMessages([]);
    setChatError(null);
    setEncryptionReady(false);
    setEncryptionError(null);
    setSharedKey(null);
    setReadMeta(null);
    setPolls([]);
    setHasOlderMessages(false);
    setLoadingOlder(false);
    loadingOlderRef.current = false;
    olderRequestRef.current = null;
    markedReadRef.current = '';
    olderCursorRef.current = null;

    getDoc(doc(db, 'chats', chatId)).then((snap) => {
      if (!active) return;
      if (!snap.exists()) {
        setChat(null);
        setChatError('This chat could not be found. Return to your chats and try opening it again.');
      } else {
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
    }).catch((error: unknown) => {
      if (!active) return;
      setChatError(error instanceof Error ? `Could not load this chat: ${error.message}` : 'Could not load this chat. Check your connection and try again.');
      setLoading(false);
    });

    const unsubscribe = subscribeToMessages(
      chatId,
      (latestMessages, page) => {
        if (!active) return;
        setRawMessages(latestMessages);
        olderCursorRef.current = page.cursor;
        setHasOlderMessages(page.hasMore);
        setLoading(false);
      },
      (error) => {
        if (!active) return;
        setChatError(error.message ? `Could not load messages: ${error.message}` : 'Could not load messages. Check your connection and try again.');
        setLoading(false);
      }
    );
    const unsubPolls = subscribeToPolls('chats', chatId, setPolls, (error) => {
      if (active) setChatError(error.message ? `Could not load chat polls: ${error.message}` : 'Could not load chat polls.');
    });
    return () => {
      active = false;
      if (chatGenerationRef.current === generation) chatGenerationRef.current += 1;
      unsubscribe();
      unsubPolls();
    };
  }, [chatId, retryVersion]);

  useEffect(() => {
    if (!chat || !profile) return;
    let cancelled = false;
    (async () => {
      try {
        const myPrivateKey = await ensureDeviceKeys(profile.uid);
        const otherUid = chat.participants.find((p) => p !== profile.uid);
        const key = otherUid ? await getSharedKeyForChat(myPrivateKey, otherUid) : null;
        if (!cancelled) {
          setSharedKey(key);
          setEncryptionError(null);
          setEncryptionReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setSharedKey(null);
          setEncryptionError(error instanceof DeviceEncryptionKeyError || error instanceof DeviceEncryptionKeyStorageError
            ? error.message
            : 'Could not prepare encryption keys. Check your connection and try again.');
          setEncryptionReady(true);
        }
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
      const allMessages = mergeMessages(olderRawMessages, rawMessages);
      const decrypted = await Promise.all(
        allMessages.map(async (m) => {
          let text = m.text;
          let replyTo = m.replyTo;
          let attachment = m.attachment;

          if (m.encrypted) {
            try {
              text = await decryptForChat(sharedKey, { ciphertext: m.text, iv: m.iv ?? '' });
            } catch (error) {
              text = messageDecryptionFallback(error);
            }
          }

          if (replyTo?.iv) {
            try {
              const replyText = await decryptForChat(sharedKey, { ciphertext: replyTo.text, iv: replyTo.iv });
              replyTo = { ...replyTo, text: replyText };
            } catch (error) {
              replyTo = { ...replyTo, text: messageDecryptionFallback(error) };
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
  }, [rawMessages, olderRawMessages, sharedKey, encryptionReady]);

  // --- Read tracking ----------------------------------------------------------
  // Mark the chat as read only while it is really on screen (tab visible), and only when a message
  // newer than MY read marker exists. The live listener means a message that arrives while the chat
  // is open is marked read AFTER we saw it, so my marker is always newer than the sender's lastMessageAt.
  const myUid = profile?.uid;

  useEffect(() => {
    const onVisibilityChange = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!chatId) return;
    setReadMeta(null);
    let active = true;
    const unsubscribe = subscribeToChat(
      chatId,
      (c) => {
        if (active) setReadMeta(c ? { lastMessageAt: c.lastMessageAt, lastMessageSenderId: c.lastMessageSenderId, lastReadAt: c.lastReadAt } : null);
      },
      (error) => {
        if (active) setChatError(error.message ? `Could not refresh chat state: ${error.message}` : 'Could not refresh chat state.');
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
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
    let active = true;
    const otherUid = chat.participants.find((p) => p !== profile.uid);
    if (otherUid) {
      isUserBlocked(profile.uid, otherUid).then((isBlocked) => {
        if (active) setBlocked(isBlocked);
      }).catch((error: unknown) => {
        if (active) setChatError(error instanceof Error ? `Could not check block status: ${error.message}` : 'Could not check block status.');
      });
    }
    return () => {
      active = false;
    };
  }, [chat, profile]);

  const presence = usePresence(chat?.participants.find((p) => p !== profile?.uid));

  if (loading) return <LoadingSpinner label="Loading chat…" />;
  if (!chat || !profile || !chatId) {
    return (
      <div style={{ padding: 24 }}>
        {chatError ?? 'Chat not found.'}
        {chatError && <button className="rb-btn rb-btn--outline" onClick={() => setRetryVersion((version) => version + 1)} style={{ marginLeft: 12 }}>Retry</button>}
      </div>
    );
  }

  async function handleLoadOlderMessages() {
    const cursor = olderCursorRef.current;
    if (!cursor || !chatId || loadingOlderRef.current) return;
    const requestChatId = chatId;
    const generation = chatGenerationRef.current;
    const requestToken = {};
    olderRequestRef.current = requestToken;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setChatError(null);
    try {
      const page = await loadOlderMessagePage(requestChatId, cursor);
      if (activeChatIdRef.current !== requestChatId || chatGenerationRef.current !== generation) return;
      olderCursorRef.current = page.cursor;
      setHasOlderMessages(page.hasMore);
      setOlderRawMessages((current) => mergeMessages(current, page.messages));
    } catch (error) {
      if (activeChatIdRef.current === requestChatId && chatGenerationRef.current === generation) {
        setChatError(error instanceof Error ? `Could not load older messages: ${error.message}` : 'Could not load older messages. Please try again.');
      }
    } finally {
      if (olderRequestRef.current === requestToken) {
        olderRequestRef.current = null;
        loadingOlderRef.current = false;
        if (activeChatIdRef.current === requestChatId && chatGenerationRef.current === generation) setLoadingOlder(false);
      }
    }
  }

  const otherUid = chat.participants.find((p) => p !== profile.uid) ?? '';
  const otherInfo = chat.participantInfo[otherUid];
  const isMuted = chat.mutedBy.includes(profile.uid);
  const isArchived = chat.archivedBy.includes(profile.uid);
  const pinnedMessages = messages.filter((m) => chat.pinnedMessageIds.includes(m.id));
  const searchResults = showSearch ? searchMessagesLocally(messages, searchTerm) : [];

  async function handleSend(text: string) {
    if (encryptionError) throw new Error(encryptionError);
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
      <div className="rb-chat-header" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => navigate(-1)} className="rb-desktop-hide rb-btn rb-btn--outline rb-icon-btn" aria-label="Back">
          <ArrowLeft size={17} aria-hidden="true" />
        </button>
        <div className="rb-chat-header__identity">
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
        <div className="rb-chat-header__actions">
          <button className="rb-btn rb-btn--outline rb-icon-btn" aria-label="Voice call" title="Voice call" onClick={() => handleStartCall('voice')} disabled={blocked}><Phone size={17} strokeWidth={1.75} /></button>
          <button className="rb-btn rb-btn--outline rb-icon-btn" aria-label="Video call" title="Video call" onClick={() => handleStartCall('video')} disabled={blocked}><Video size={17} strokeWidth={1.75} /></button>
          <details
            ref={headerMenuRef}
            className="rb-chat-header-menu"
            aria-label="Chat actions"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                headerMenuRef.current?.removeAttribute('open');
                headerMenuRef.current?.querySelector('summary')?.focus();
              }
            }}
          >
            <summary className="rb-btn rb-btn--outline rb-icon-btn" aria-label="More chat actions" title="More chat actions">
              <MoreVertical size={17} strokeWidth={1.75} />
            </summary>
            <div className="rb-chat-header-menu__panel rb-menu-surface">
              <div className="rb-chat-header-menu__label">Chat tools</div>
              <button type="button" className="rb-chat-header-menu__item" onClick={(event) => {
                setShowSearch((visible) => !visible);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}>
                <Search size={16} aria-hidden="true" />
                <span>{showSearch ? 'Close search' : 'Search in chat'}</span>
              </button>
              <button type="button" className="rb-chat-header-menu__item" onClick={(event) => {
                setShowPolls((visible) => !visible);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}>
                <BarChart3 size={16} aria-hidden="true" />
                <span>{showPolls ? 'Close polls' : 'Polls'}</span>
              </button>
              <div className="rb-chat-header-menu__label rb-chat-header-menu__label--separated">More</div>
              <div className="rb-chat-header-menu__summary">
                <GiAiSummaryButton
                  onGenerate={() => summarizeConversation('chats', chatId)}
                  onOpen={() => headerMenuRef.current?.removeAttribute('open')}
                />
                <span>Summarize conversation</span>
              </div>
              <button type="button" className="rb-chat-header-menu__item" onClick={(event) => {
                setShowOptions(true);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}>
                <MoreVertical size={16} aria-hidden="true" />
                <span>Chat settings</span>
              </button>
            </div>
          </details>
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

      {chatError && (
        <div role="alert" style={{ padding: '8px 20px', color: 'var(--color-danger)', borderBottom: '1px solid var(--color-border)' }}>
          {chatError}
          <button className="rb-btn rb-btn--outline" onClick={() => setRetryVersion((version) => version + 1)} style={{ marginLeft: 12 }}>Retry</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {hasOlderMessages && !showSearch && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <button className="rb-btn rb-btn--outline" onClick={handleLoadOlderMessages} disabled={loadingOlder}>
              {loadingOlder ? 'Loading older messages…' : 'Load older messages'}
            </button>
          </div>
        )}
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

      {encryptionError && (
        <p role="alert" style={{ margin: '0 16px 8px', color: 'var(--color-danger)', fontSize: 13 }}>
          {encryptionError}
        </p>
      )}

      {!blocked && !encryptionError && (
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

function mergeMessages(...messageLists: Message[][]): Message[] {
  const uniqueMessages = new Map<string, Message>();
  for (const list of messageLists) {
    for (const message of list) uniqueMessages.set(message.id, message);
  }
  return [...uniqueMessages.values()].sort(
    (left, right) => left.createdAt - right.createdAt || right.id.localeCompare(left.id)
  );
}