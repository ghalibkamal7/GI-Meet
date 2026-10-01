import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getGroupByInviteCode, joinGroupByInviteCode } from './groupService';
import type { Group } from './groupTypes';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export function JoinGroupPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteCode) return;
    getGroupByInviteCode(inviteCode).then((g) => {
      if (!g) setError('This invite link is invalid or has expired.');
      setGroup(g);
      setLoading(false);
    });
  }, [inviteCode]);

  const alreadyMember = Boolean(group && profile && group.members.includes(profile.uid));

  async function handleJoin() {
    if (!profile || !inviteCode) return;
    setJoining(true);
    const joined = await joinGroupByInviteCode(inviteCode, profile.uid, { displayName: profile.displayName, photoURL: profile.photoURL });
    setJoining(false);
    if (joined) navigate(`/groups/${joined.id}`);
    else setError('Could not join this group.');
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
            <h2 style={{ marginBottom: 8 }}>{group?.name}</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 4 }}>{group?.description}</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 20 }}>
              {group?.members.length} members
            </p>
            {alreadyMember ? (
              <button className="rb-btn rb-btn--primary" style={{ width: '100%' }} onClick={() => navigate(`/groups/${group!.id}`)}>
                You're already in this group — Open it
              </button>
            ) : (
              <button className="rb-btn rb-btn--primary" style={{ width: '100%' }} onClick={handleJoin} disabled={joining}>
                {joining ? 'Joining…' : 'Join group'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}