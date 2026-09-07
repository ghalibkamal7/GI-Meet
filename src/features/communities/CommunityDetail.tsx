import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Megaphone, Plus, Globe, Lock, Settings2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getCommunity,
  subscribeToCommunityAnnouncements,
  postCommunityAnnouncement,
  leaveCommunity,
  makeCommunityAdmin,
  createSubGroup,
} from './communityService';
import { getGroup } from '../groups/groupService';
import type { Community, CommunityAnnouncement } from './communityTypes';
import type { Group } from '../groups/groupTypes';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

export function CommunityDetail() {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [community, setCommunity] = useState<Community | null>(null);
  const [subGroups, setSubGroups] = useState<Group[]>([]);
  const [announcements, setAnnouncements] = useState<CommunityAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [announceText, setAnnounceText] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    if (!communityId) return;
    getCommunity(communityId).then((c) => {
      setCommunity(c);
      setLoading(false);
    });
    return subscribeToCommunityAnnouncements(communityId, setAnnouncements);
  }, [communityId]);

  useEffect(() => {
    if (!community) return;
    Promise.all(community.groupIds.map((id) => getGroup(id))).then((groups) => {
      setSubGroups(groups.filter((g): g is Group => g !== null));
    });
  }, [community]);

  if (loading) return <LoadingSpinner label="Loading community…" />;
  if (!community || !profile) return <div style={{ padding: 24 }}>Community not found.</div>;

  const isAdmin = community.admins.includes(profile.uid);

  async function handlePostAnnouncement() {
    if (!announceText.trim()) return;
    await postCommunityAnnouncement(communityId!, profile!.uid, profile!.displayName, announceText);
    setAnnounceText('');
  }

  async function handleCreateSubGroup() {
    if (!newGroupName.trim()) return;
    const groupId = await createSubGroup(communityId!, {
      name: newGroupName,
      description: '',
      createdBy: profile!.uid,
      creatorInfo: { displayName: profile!.displayName, photoURL: profile!.photoURL },
    });
    setNewGroupName('');
    setShowNewGroup(false);
    navigate(`/groups/${groupId}`);
  }

  async function handleLeave() {
    await leaveCommunity(communityId!, profile!.uid);
    navigate('/groups');
  }

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, color: '#fff', flexShrink: 0 }}>
          {community.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, marginBottom: 2 }}>{community.name}</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>{community.description}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {community.isPublic ? <Globe size={12} strokeWidth={1.75} /> : <Lock size={12} strokeWidth={1.75} />}
              {community.isPublic ? 'Public' : 'Private'}
            </span>
            <button onClick={() => setShowMembers(true)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
              {community.members.length} members
            </button>
            <span>{subGroups.length} groups</span>
          </div>
        </div>
      </div>

      <div className="rb-card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 600, fontSize: 14 }}>
          <Megaphone size={16} strokeWidth={1.75} /> Announcements
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input className="rb-input" placeholder="Post to the whole community..." value={announceText} onChange={(e) => setAnnounceText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePostAnnouncement()} />
            <button className="rb-btn rb-btn--primary" style={{ fontSize: 13 }} onClick={handlePostAnnouncement}>Post</button>
          </div>
        )}
        {announcements.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No announcements yet.</p>}
        {announcements.map((a) => (
          <div key={a.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
            <strong>{a.postedByName}</strong> · <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{new Date(a.createdAt).toLocaleDateString()}</span>
            <div>{a.text}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15 }}>Groups in this community</h2>
        <button className="rb-btn rb-btn--outline" style={{ fontSize: 12, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setShowNewGroup(true)}>
          <Plus size={13} strokeWidth={1.75} /> New group
        </button>
      </div>

      {showNewGroup && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input className="rb-input" placeholder="Group name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateSubGroup()} autoFocus />
          <button className="rb-btn rb-btn--primary" style={{ fontSize: 13 }} onClick={handleCreateSubGroup}>Add</button>
        </div>
      )}

      {subGroups.map((g) => (
        <button
          key={g.id}
          onClick={() => navigate(`/groups/${g.id}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--color-border)', textAlign: 'left', cursor: 'pointer' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--color-brand-700)' }}>
            {g.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{g.members.length} members</div>
          </div>
        </button>
      ))}

      <button className="rb-btn rb-btn--outline" style={{ marginTop: 24, color: 'var(--color-danger)' }} onClick={() => setShowLeaveConfirm(true)}>
        Leave community
      </button>

      {showMembers && (
        <div style={overlayStyle} onClick={() => setShowMembers(false)}>
          <div className="rb-card" style={{ width: 340, padding: 20, maxHeight: '70vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Settings2 size={16} strokeWidth={1.75} /> Members</h3>
            {community.members.map((uid) => {
              const info = community.memberInfo[uid];
              const memberIsAdmin = community.admins.includes(uid);
              return (
                <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ fontSize: 14 }}>{info?.displayName ?? uid} {memberIsAdmin && <em style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>(admin)</em>}</span>
                  {isAdmin && !memberIsAdmin && (
                    <button className="rb-btn rb-btn--outline" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => makeCommunityAdmin(communityId!, uid)}>
                      Make admin
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showLeaveConfirm && (
        <ConfirmDialog
          title="Leave this community?"
          message="You'll be removed from the community and its announcement group. You can rejoin later if it's public, or with a new invite if it's private."
          confirmLabel="Leave community"
          danger
          onConfirm={handleLeave}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
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
