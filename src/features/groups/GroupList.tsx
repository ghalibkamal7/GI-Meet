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
    <div className="rb-list-page rb-groups-page">
      <header className="rb-groups-header">
        <div>
          <span className="rb-eyebrow">Together, in one place</span>
          <h1>Groups &amp; communities</h1>
          <p>Find your people and keep the conversation going.</p>
        </div>
        <div className="rb-groups-tabs" role="group" aria-label="Groups and communities">
          <button type="button" aria-pressed={tab === 'groups'} onClick={() => setTab('groups')} className={tab === 'groups' ? 'is-active' : ''}>Groups</button>
          <button type="button" aria-pressed={tab === 'communities'} onClick={() => setTab('communities')} className={tab === 'communities' ? 'is-active' : ''}>Communities</button>
        </div>
      </header>

      {tab === 'groups' ? (
        <>
          <div className="rb-section-heading">
            <h2>Your groups <span>{visibleGroups.length}</span></h2>
            <button className="rb-btn rb-btn--primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} strokeWidth={2} /> New group
            </button>
          </div>

          {loading && <SkeletonList rows={4} />}
          {!loading && visibleGroups.length === 0 && (
            <div className="rb-empty-state rb-groups-empty">
              <div className="rb-empty-state__icon"><Plus size={20} /></div>
              <h2>Your group space is waiting</h2>
              <p>Create a group to bring a conversation together.</p>
            </div>
          )}

          {visibleGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => navigate(`/groups/${group.id}`)}
              className="rb-group-row"
            >
              <div className="rb-group-row__avatar">{group.name.charAt(0).toUpperCase()}</div>
              <div className="rb-group-row__body">
                <div className="rb-group-row__title">{group.name}</div>
                <div className="rb-group-row__preview">
                  {group.lastMessage || `${group.members.length} members`}
                </div>
              </div>
              <span className="rb-group-row__meta">{group.members.length} members</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <div className="rb-section-heading">
            <h2>Your communities <span>{communities.length}</span></h2>
            <div className="rb-section-heading__actions">
              <button className="rb-btn rb-btn--outline" onClick={() => setShowDiscover(true)}>
                <Compass size={15} strokeWidth={1.75} /> Discover
              </button>
              <button className="rb-btn rb-btn--primary" onClick={() => setShowCreateCommunity(true)}>
                <Plus size={16} strokeWidth={2} /> New
              </button>
            </div>
          </div>

          {communities.length === 0 && (
            <div className="rb-empty-state rb-groups-empty">
              <div className="rb-empty-state__icon"><Compass size={20} /></div>
              <h2>Find your community</h2>
              <p>Create a private space or discover a public community to join.</p>
            </div>
          )}

          {communities.map((community) => (
            <button key={community.id} onClick={() => navigate(`/communities/${community.id}`)} className="rb-group-row">
              <div className="rb-group-row__avatar rb-group-row__avatar--community">{community.name.charAt(0).toUpperCase()}</div>
              <div className="rb-group-row__body">
                <div className="rb-group-row__title">{community.name}</div>
                <div className="rb-group-row__preview rb-group-row__preview--meta">
                  <span>
                    {community.isPublic ? <Globe size={12} strokeWidth={1.75} /> : <Lock size={12} strokeWidth={1.75} />}
                    {community.isPublic ? 'Public' : 'Private'}
                  </span>
                  {community.members.length} members · {community.groupIds.length} groups
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
