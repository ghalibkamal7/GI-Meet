import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Compass, Globe, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserGroups } from './groupService';
import type { Group } from './groupTypes';
import { CreateGroupModal } from './CreateGroupModal';
import { soundService } from '../../services/soundService';
import { subscribeToUserCommunities } from '../communities/communityService';
import type { Community } from '../communities/communityTypes';
import { CreateCommunityModal } from '../communities/CreateCommunityModal';
import { DiscoverCommunitiesModal } from '../communities/DiscoverCommunitiesModal';
import { SkeletonList } from '../../components/common/SkeletonList';

type Tab = 'groups' | 'communities';

export function GroupList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const u1 = subscribeToUserGroups(profile.uid, (g) => {
      setGroups(g);
      setLoading(false);
    });
    const u2 = subscribeToUserCommunities(profile.uid, setCommunities);
    return () => {
      u1();
      u2();
    };
  }, [profile]);

  // Play a chime only for a new message sent by another user.
  // Initial group loading and our own messages must stay silent.
  const lastSeenTimestamps = useRef<Map<string, number>>(new Map());
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!profile) return;

    if (isFirstLoad.current) {
      groups.forEach((g) => lastSeenTimestamps.current.set(g.id, g.lastMessageAt));
      isFirstLoad.current = false;
      return;
    }

    groups.forEach((g) => {
      const previousTimestamp = lastSeenTimestamps.current.get(g.id);
      const isNewMessage = previousTimestamp !== undefined && g.lastMessageAt > previousTimestamp;
      const isFromAnotherUser = !!g.lastMessageSenderId && g.lastMessageSenderId !== profile.uid;
      const isMuted = g.mutedBy.includes(profile.uid);

      if (isNewMessage && isFromAnotherUser && !isMuted) {
        soundService.playMessageChime();
      }

      lastSeenTimestamps.current.set(g.id, g.lastMessageAt);
    });
  }, [groups, profile]);

  const visibleGroups = groups.filter((g) => !g.communityId); // sub-groups show inside their community, not here

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--color-surface-alt)', borderRadius: 10, padding: 3, width: 'fit-content' }}>
          <button onClick={() => setTab('groups')} style={tabBtnStyle(tab === 'groups')}>Groups</button>
          <button onClick={() => setTab('communities')} style={tabBtnStyle(tab === 'communities')}>Communities</button>
        </div>
      </div>

      {tab === 'groups' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 20px 16px' }}>
            <h1 style={{ fontSize: 22 }}>Groups</h1>
            <button className="rb-btn rb-btn--primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowCreate(true)}>
              <Plus size={16} strokeWidth={2} /> New group
            </button>
          </div>

          {loading && <SkeletonList rows={4} />}
          {!loading && visibleGroups.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No groups yet.</div>
          )}

          {visibleGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => navigate(`/groups/${group.id}`)}
              style={rowStyle}
            >
              <div style={avatarStyle}>{group.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{group.name}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.lastMessage || `${group.members.length} members`}
                </div>
              </div>
            </button>
          ))}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 20px 16px', flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ fontSize: 22 }}>Communities</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="rb-btn rb-btn--outline" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }} onClick={() => setShowDiscover(true)}>
                <Compass size={15} strokeWidth={1.75} /> Discover
              </button>
              <button className="rb-btn rb-btn--primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowCreateCommunity(true)}>
                <Plus size={16} strokeWidth={2} /> New
              </button>
            </div>
          </div>

          {communities.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No communities yet — create one, or discover a public community to join.
            </div>
          )}

          {communities.map((c) => (
            <button key={c.id} onClick={() => navigate(`/communities/${c.id}`)} style={rowStyle}>
              <div style={{ ...avatarStyle, borderRadius: 12 }}>{c.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {c.isPublic ? <Globe size={12} strokeWidth={1.75} /> : <Lock size={12} strokeWidth={1.75} />}
                  {c.members.length} members · {c.groupIds.length} groups
                </div>
              </div>
            </button>
          ))}
        </>
      )}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
      {showCreateCommunity && <CreateCommunityModal onClose={() => setShowCreateCommunity(false)} />}
      {showDiscover && <DiscoverCommunitiesModal onClose={() => setShowDiscover(false)} />}
    </div>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 16px',
    borderRadius: 8,
    border: 'none',
    background: active ? 'var(--color-surface)' : 'transparent',
    color: active ? 'var(--color-brand-700)' : 'var(--color-text-muted)',
    fontWeight: active ? 600 : 500,
    fontSize: 13.5,
    cursor: 'pointer',
    boxShadow: active ? 'var(--shadow-sm)' : 'none',
  };
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '12px 20px',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--color-border)',
  textAlign: 'left',
  cursor: 'pointer',
};

const avatarStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  background: 'var(--color-accent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  color: '#fff',
  flexShrink: 0,
};
