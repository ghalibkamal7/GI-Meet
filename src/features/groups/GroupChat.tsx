import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToGroup,
  subscribeToGroupMessages,
  sendGroupMessage,
  markGroupRead,
  editGroupMessage,
  deleteGroupMessage,
  toggleGroupReaction,
  toggleGroupStar,
  toggleGroupPin,
  subscribeToAnnouncements,
  postAnnouncement,
} from './groupService';
import { getMyGroupKey } from './groupCrypto';
import {
  ensureDeviceKeys,
  encryptForChat,
  decryptForChat,
  decryptAttachmentUrl,
  messageDecryptionFallback,
  DeviceEncryptionKeyError,
  DeviceEncryptionKeyStorageError,
} from '../chat/e2ee';
import type { Group, Announcement } from './groupTypes';
import type { Message } from '../chat/chatTypes';
import { MessageBubble } from '../../components/common/MessageBubble';
import { MessageComposer } from '../../components/common/MessageComposer';
import { ForwardMessageModal } from '../../components/common/ForwardMessageModal';
import { uploadEncryptedFile } from '../../services/storageService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { GroupInfoPanel } from './GroupInfoPanel';
import { createMeeting } from '../meetings/meetingService';
import { subscribeToPolls, type Poll } from '../polls/pollService';
import { PollCard, CreatePollModal } from '../polls/PollComponents';
import { GiAiSummaryButton } from '../gi-ai/GiAiSummaryButton';
import { summarizeConversation } from '../gi-ai/giAiService';
import { Phone, Video, BarChart3, Megaphone, Pin, Lock, MoreVertical } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { getPendingReadMark } from '../chat/readState';

export function GroupChat() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const headerMenuRef = useRef<HTMLDetailsElement | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [rawMessages, setRawMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupKey, setGroupKey] = useState<CryptoKey | null>(null);
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [encryptionError, setEncryptionError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showPolls, setShowPolls] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [announceText, setAnnounceText] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    const u1 = subscribeToGroup(groupId, (g) => {
      setGroup(g);
      setLoading(false);
    });
    const u2 = subscribeToGroupMessages(groupId, setRawMessages);
    const u3 = subscribeToPolls('groups', groupId, setPolls);
    const u4 = subscribeToAnnouncements(groupId, setAnnouncements);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !profile) return;
    let cancelled = false;
    setGroupKey(null);
    setEncryptionError(null);
    setEncryptionReady(false);
    (async () => {
      try {
        const myPrivateKey = await ensureDeviceKeys(profile.uid);
        const key = await getMyGroupKey(groupId, profile.uid, myPrivateKey);
        if (!key) {
          throw new DeviceEncryptionKeyError(
            'This device cannot access the group encryption key. Sending is disabled until the existing account key and group key are available.'
          );
        }
        if (!cancelled) {
          setGroupKey(key);
          setEncryptionError(null);
          setEncryptionReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setGroupKey(null);
          setEncryptionError(error instanceof DeviceEncryptionKeyError || error instanceof DeviceEncryptionKeyStorageError
            ? error.message
            : 'Could not prepare group encryption keys. Check your connection and try again.');
          setEncryptionReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, profile]);

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
            try {
              text = await decryptForChat(groupKey, { ciphertext: m.text, iv: m.iv ?? '' });
            } catch (error) {
              text = messageDecryptionFallback(error);
            }
          }

          if (replyTo?.iv) {
            try {
              const replyText = await decryptForChat(groupKey, { ciphertext: replyTo.text, iv: replyTo.iv });
              replyTo = { ...replyTo, text: replyText };
            } catch (error) {
              replyTo = { ...replyTo, text: messageDecryptionFallback(error) };
            }
          }

          if (attachment?.encrypted && attachment.iv && groupKey) {
            try {
              const objectUrl = await decryptAttachmentUrl(groupKey, attachment.url, attachment.iv, attachment.mimeType);
              createdUrls.push(objectUrl);
              attachment = { ...attachment, url: objectUrl };
            } catch {
              // Leave the original (undecryptable) URL rather than crash.
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
  }, [rawMessages, groupKey, encryptionReady]);

    // --- Read tracking (per member) ---------------------------------------------
  // Same idea as 1-1 chats, but the read marker lives in group.lastReadAt[myUid] — every member has their own.
  const myUid = profile?.uid;
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === 'visible');
  const markedReadRef = useRef('');

  useEffect(() => {
    const onVisibilityChange = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!groupId || !myUid || !tabVisible || !group) return;
    const key = getPendingReadMark(groupId, myUid, group, markedReadRef.current);
    if (!key) return;
    markedReadRef.current = key;
    markGroupRead(groupId, myUid).catch(() => {
      markedReadRef.current = ''; // let the next change retry
    });
  }, [groupId, myUid, tabVisible, group]);
  if (loading) return <LoadingSpinner label="Loading group…" />;
  if (!group || !profile || !groupId) return <div style={{ padding: 24 }}>Group not found.</div>;

  const isAdmin = group.admins.includes(profile.uid) || group.coAdmins.includes(profile.uid);
  const latestAnnouncement = announcements[0];

  async function handleSend(text: string) {
    if (encryptionError) throw new Error(encryptionError);
    if (!groupKey) throw new Error('Group encryption is not ready. Sending is disabled until the group key is available.');
    const enc = await encryptForChat(groupKey, text);
    const payloadText = enc.ciphertext;
    const encrypted = true;
    const iv = enc.iv;

    if (editingMessage) {
      await editGroupMessage(groupId!, editingMessage.id, payloadText, { encrypted: true, iv });
      setEditingMessage(null);
      return;
    }

    let replyToPayload = replyingTo
      ? { messageId: replyingTo.id, text: replyingTo.text, senderId: replyingTo.senderId }
      : undefined;
    if (replyToPayload) {
      const encReply = await encryptForChat(groupKey, replyToPayload.text);
      replyToPayload = { ...replyToPayload, text: encReply.ciphertext, iv: encReply.iv } as typeof replyToPayload & { iv: string };
    }

    await sendGroupMessage({
      groupId: groupId!,
      senderId: profile!.uid,
      text: payloadText,
      encrypted,
      iv,
      replyTo: replyToPayload,
    });
    setReplyingTo(null);
  }

  async function handleSendFile(file: File) {
    if (!groupKey || encryptionError) {
      showToast(encryptionError ?? 'Group encryption is not ready. The file was not sent.', 'error');
      return;
    }
    setUploading(true);
    try {
      const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      let result;
      result = await uploadEncryptedFile(file, `groups/${groupId}`, groupKey);
      const encrypted = true;
      const iv = result.iv;

      await sendGroupMessage({
        groupId: groupId!,
        senderId: profile!.uid,
        text: '',
        encrypted: true,
        attachment: { type, url: result.url, name: result.name, sizeBytes: result.sizeBytes, mimeType: result.mimeType, encrypted, iv },
      });
    } catch (err) {
      showToast(err instanceof Error ? `Upload failed: ${err.message}` : 'Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleSendVoice(blob: Blob, durationSeconds: number) {
    if (!groupKey || encryptionError) {
      showToast(encryptionError ?? 'Group encryption is not ready. The voice message was not sent.', 'error');
      return;
    }
    setUploading(true);
    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      let result;
      result = await uploadEncryptedFile(file, `groups/${groupId}`, groupKey);
      const encrypted = true;
      const iv = result.iv;

      await sendGroupMessage({
        groupId: groupId!,
        senderId: profile!.uid,
        text: '',
        encrypted: true,
        attachment: { type: 'audio', url: result.url, name: 'Voice message', sizeBytes: result.sizeBytes, mimeType: result.mimeType, durationSeconds, encrypted, iv },
      });
    } catch (err) {
      showToast(err instanceof Error ? `Voice message failed: ${err.message}` : 'Voice message failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleStartMeeting(audioOnly: boolean) {
    const meetingCode = await createMeeting({ hostUid: profile!.uid, title: `${group!.name} ${audioOnly ? 'call' : 'meeting'}`, groupId, isAudioOnly: audioOnly });
    navigate(`/meeting/${meetingCode}/lobby`);
  }

  function handleToggleReaction(message: Message, emoji: string) {
    const already = message.reactions[emoji]?.includes(profile!.uid) ?? false;
    toggleGroupReaction(groupId!, message.id, emoji, profile!.uid, already);
  }

  return (
    <div className="rb-chat-layout" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="rb-chat-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        <button type="button" className="rb-chat-header__group-title" aria-label={`Open ${group.name} group information`} style={{ fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, border: 0, background: 'transparent', color: 'var(--color-text)', padding: 0 }} onClick={() => setShowInfo(true)}>
          {group.name} <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--color-text-muted)' }}>({group.members.length})</span>
          {groupKey && (
            <span title="End-to-end encrypted" style={{ display: 'flex', color: 'var(--color-brand-600)' }}>
              <Lock size={12} strokeWidth={1.75} />
            </span>
          )}
        </button>
        <div className="rb-chat-header__actions">
          <button className="rb-btn rb-btn--outline rb-icon-btn" aria-label="Start voice call" title="Start voice call" onClick={() => handleStartMeeting(true)}><Phone size={17} strokeWidth={1.75} /></button>
          <button className="rb-btn rb-btn--primary" aria-label="Start video meeting" style={{ padding: '6px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => handleStartMeeting(false)}>
            <Video size={15} strokeWidth={1.75} /> Start meeting
          </button>
          <details
            ref={headerMenuRef}
            className="rb-chat-header-menu"
            aria-label="Group chat actions"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                headerMenuRef.current?.removeAttribute('open');
                headerMenuRef.current?.querySelector('summary')?.focus();
              }
            }}
          >
            <summary className="rb-btn rb-btn--outline rb-icon-btn" aria-label="More group chat actions" title="More group chat actions">
              <MoreVertical size={17} strokeWidth={1.75} />
            </summary>
            <div className="rb-chat-header-menu__panel rb-menu-surface">
              <div className="rb-chat-header-menu__label">Chat tools</div>
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
                  onGenerate={() => summarizeConversation('groups', groupId!)}
                  onOpen={() => headerMenuRef.current?.removeAttribute('open')}
                />
                <span>Summarize conversation</span>
              </div>
            </div>
          </details>
        </div>
      </div>

      {latestAnnouncement && (
        <div style={{ padding: '8px 20px', background: 'var(--color-brand-100)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Megaphone size={14} strokeWidth={1.75} /> <strong>{latestAnnouncement.postedByName}:</strong> {latestAnnouncement.text}
        </div>
      )}

      {isAdmin && (
        <div style={{ padding: '4px 20px', fontSize: 12 }}>
          <button onClick={() => setShowAnnounceForm((v) => !v)} style={{ border: 'none', background: 'none', color: 'var(--color-brand-600)', cursor: 'pointer' }}>
            + Post announcement
          </button>
          {showAnnounceForm && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input className="rb-input" value={announceText} onChange={(e) => setAnnounceText(e.target.value)} placeholder="Announcement text" />
              <button
                className="rb-btn rb-btn--primary"
                style={{ fontSize: 12 }}
                onClick={async () => {
                  if (!announceText.trim()) return;
                  await postAnnouncement(groupId!, profile.uid, profile.displayName, announceText);
                  setAnnounceText('');
                  setShowAnnounceForm(false);
                }}
              >
                Post
              </button>
            </div>
          )}
        </div>
      )}

      {group.pinnedMessageIds.length > 0 && (
        <div style={{ padding: '6px 20px', background: 'var(--color-surface-alt)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Pin size={12} strokeWidth={1.75} /> {group.pinnedMessageIds.length} pinned message{group.pinnedMessageIds.length !== 1 ? 's' : ''}
        </div>
      )}

      {showPolls && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', maxHeight: 240, overflowY: 'auto' }}>
          <button className="rb-btn rb-btn--outline" style={{ fontSize: 12, marginBottom: 10 }} onClick={() => setShowCreatePoll(true)}>+ New poll</button>
          {polls.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No polls yet.</p>}
          {polls.map((poll) => (
            <PollCard key={poll.id} poll={poll} parentType="groups" parentId={groupId!} currentUid={profile.uid} isCreator={poll.createdBy === profile.uid} />
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.senderId === profile.uid}
            currentUid={profile.uid}
            onReply={setReplyingTo}
            onDelete={(id) => deleteGroupMessage(groupId!, id)}
            onEdit={(msg) => setEditingMessage(msg)}
            onForward={(msg) => setForwardingMessage(msg)}
            onToggleReaction={handleToggleReaction}
            onToggleStar={(msg) => toggleGroupStar(groupId!, msg.id, profile.uid, msg.starredBy.includes(profile.uid))}
            onTogglePin={(msg) => toggleGroupPin(groupId!, msg.id, group.pinnedMessageIds.includes(msg.id))}
            isPinned={group.pinnedMessageIds.includes(m.id)}
          />
        ))}
        {uploading && <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Uploading…</p>}
      </div>

      {editingMessage && (
        <div style={{ padding: '4px 20px', fontSize: 12, color: 'var(--color-brand-600)' }}>
          Editing message — <button onClick={() => setEditingMessage(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}>cancel</button>
        </div>
      )}

      {encryptionError ? (
        <p role="alert" style={{ margin: '0 16px 8px', color: 'var(--color-danger)', fontSize: 13 }}>
          {encryptionError}
        </p>
      ) : (
        <MessageComposer
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSend={handleSend}
          onSendFile={handleSendFile}
          onSendVoice={handleSendVoice}
          placeholder={editingMessage ? 'Edit your message...' : 'Type a message...'}
        />
      )}

      {forwardingMessage && <ForwardMessageModal message={forwardingMessage} onClose={() => setForwardingMessage(null)} />}
      {showCreatePoll && <CreatePollModal parentType="groups" parentId={groupId!} createdBy={profile.uid} onClose={() => setShowCreatePoll(false)} />}

      {showInfo && (
        <GroupInfoPanel
          group={group}
          currentUid={profile.uid}
          onClose={() => setShowInfo(false)}
          onLeft={() => navigate('/groups')}
        />
      )}
    </div>
  );
}