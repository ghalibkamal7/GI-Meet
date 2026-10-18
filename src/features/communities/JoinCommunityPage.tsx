import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getCommunityByInviteCode, joinCommunityByInviteCode } from './communityService';
import type { CommunityInvitePreview } from '../../services/invitationService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export function JoinCommunityPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [community, setCommunity] = useState<CommunityInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteCode) return;
    getCommunityByInviteCode(inviteCode).then((c) => {
      if (!c) setError('This invite link is invalid or has expired.');
      setCommunity(c);
      setLoading(false);
    });
  }, [inviteCode]);

  async function handleJoin() {
    if (!profile || !community) return;
    setJoining(true);
    const joinedId = await joinCommunityByInviteCode(inviteCode!);
    setJoining(false);
    navigate(`/communities/${joinedId}`);
  }

  if (loading) return <LoadingSpinner label="Loading invite…" />;

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="rb-card" style={{ width: 340, padding: 28, textAlign: 'center' }}>
        {error ? (
          <>
            <p className="rb-error-text">{error}</p>
            <button className="rb-btn rb-btn--outline" onClick={() => navigate('/')}>Go home</button>
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: 8 }}>{community?.name}</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 4 }}>{community?.description}</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 20 }}>
              {community?.membersCount} members · {community?.groupsCount} groups
            </p>
            <button className="rb-btn rb-btn--primary" style={{ width: '100%' }} onClick={community?.alreadyMember ? () => navigate(`/communities/${community.id}`) : handleJoin} disabled={joining}>
              {community?.alreadyMember ? 'Open community' : joining ? 'Joining…' : 'Join community'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
