import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getGroup,
  subscribeToGroupMessages,
  sendGroupMessage,
  editGroupMessage,
  deleteGroupMessage,
  toggleGroupReaction,
  toggleGroupStar,
  toggleGroupPin,
  subscribeToAnnouncements,
  postAnnouncement,
} from './groupService';
import type { Group, Announcement } from './groupTypes';
import type { Message } from '../chat/chatTypes';
import { MessageBubble } from '../../components/common/MessageBubble';
import { MessageComposer } from '../../components/common/MessageComposer';
import { ForwardMessageModal } from '../../components/common/ForwardMessageModal';
import { uploadFile } from '../../services/storageService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { GroupInfoPanel } from './GroupInfoPanel';
import { createMeeting } from '../meetings/meetingService';
import { subscribeToPolls, type Poll } from '../polls/pollService';
import { PollCard, CreatePollModal } from '../polls/PollComponents';
import { GiAiSummaryButton } from '../gi-ai/GiAiSummaryButton';
import { summarizeConversation } from '../gi-ai/giAiService';
import { Phone, Video, BarChart3, Megaphone, Pin } from 'lucide-react';

export function GroupChat() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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

  useEffect(() => {
    if (!groupId) return;
    getGroup(groupId).then((g) => {
      setGroup(g);
      setLoading(false);
    });
    const u1 = subscribeToGroupMessages(groupId, setMessages);
    const u2 = subscribeToPolls('groups', groupId, setPolls);
    const u3 = subscribeToAnnouncements(groupId, setAnnouncements);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [groupId]);

  if (loading) return <LoadingSpinner label="Loading group…" />;
  if (!group || !profile || !groupId) return <div style={{ padding: 24 }}>Group not found.</div>;

  const isAdmin = group.admins.includes(profile.uid) || group.coAdmins.includes(profile.uid);
  const latestAnnouncement = announcements[0];

  async function handleSend(text: string) {
    if (editingMessage) {
      await editGroupMessage(groupId!, editingMessage.id, text);
      setEditingMessage(null);
      return;
    }
    await sendGroupMessage({
      groupId: groupId!,
      senderId: profile!.uid,
      text,
      replyTo: replyingTo ? { messageId: replyingTo.id, text: replyingTo.text, senderId: replyingTo.senderId } : undefined,
    });
    setReplyingTo(null);
  }

  async function handleSendFile(file: File) {
    const { promise } = uploadFile(file, `groups/${groupId}`);
    const result = await promise;
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
    await sendGroupMessage({
      groupId: groupId!,
      senderId: profile!.uid,
      text: '',
      attachment: { type, url: result.url, name: result.name, sizeBytes: result.sizeBytes, mimeType: result.mimeType },
    });
  }

  async function handleSendVoice(blob: Blob, durationSeconds: number) {
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
    const { promise } = uploadFile(file, `groups/${groupId}`);
    const result = await promise;
    await sendGroupMessage({
      groupId: groupId!,
      senderId: profile!.uid,
      text: '',
      attachment: { type: 'audio', url: result.url, name: 'Voice message', sizeBytes: result.sizeBytes, mimeType: result.mimeType, durationSeconds },
    });
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowInfo(true)}>
          {group.name} <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--color-text-muted)' }}>({group.members.length})</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="rb-btn rb-btn--outline rb-icon-btn" title="Start voice call" onClick={() => handleStartMeeting(true)}><Phone size={16} strokeWidth={1.75} /></button>
          <button className="rb-btn rb-btn--outline" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowPolls((v) => !v)}>
            <BarChart3 size={15} strokeWidth={1.75} /> Polls
          </button>
          <GiAiSummaryButton onGenerate={() => summarizeConversation('groups', groupId!)} />
          <button className="rb-btn rb-btn--primary" style={{ padding: '6px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => handleStartMeeting(false)}>
            <Video size={15} strokeWidth={1.75} /> Start meeting
          </button>
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
      </div>

      {editingMessage && (
        <div style={{ padding: '4px 20px', fontSize: 12, color: 'var(--color-brand-600)' }}>
          Editing message — <button onClick={() => setEditingMessage(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}>cancel</button>
        </div>
      )}

      <MessageComposer
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
        onSendFile={handleSendFile}
        onSendVoice={handleSendVoice}
        placeholder={editingMessage ? 'Edit your message...' : 'Type a message...'}
      />

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
