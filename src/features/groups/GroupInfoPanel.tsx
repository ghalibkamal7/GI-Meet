import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Bell, BellOff, FolderOpen, UserPlus } from 'lucide-react';
import type { Group } from './groupTypes';
import { removeMember, makeAdmin, makeCoAdmin, removeCoAdmin, leaveGroup, updateGroupInfo, toggleMuteGroup, toggleGroupAsRoom } from './groupService';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { AddMemberModal } from './AddMemberModal';

interface Props {
  group: Group;
  currentUid: string;
  onClose: () => void;
  onLeft: () => void;
}

export function GroupInfoPanel({ group, currentUid, onClose, onLeft }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isAdmin = group.admins.includes(currentUid);
  const isCoAdmin = group.coAdmins.includes(currentUid);
  const canManage = isAdmin || isCoAdmin;
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const isMuted = group.mutedBy.includes(currentUid);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

  async function handleSaveInfo() {
    await updateGroupInfo(group.id, { name, description });
    showToast('Group info updated.', 'success');
  }

  async function handleLeave() {
    await leaveGroup(group.id, currentUid);
    onLeft();
  }

  function handleCopyInvite() {
    navigator.clipboard.writeText(`${window.location.origin}/join-group/${group.inviteCode}`);
    showToast('Invite link copied.', 'success');
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-label="Group information" style={{ width: 380, padding: 20, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>Group info</h3>

        {canManage ? (
          <>
            <input className="rb-input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8 }} />
            <textarea className="rb-input" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ marginBottom: 8 }} />
            <button className="rb-btn rb-btn--outline" style={{ marginBottom: 16 }} onClick={handleSaveInfo}>Save changes</button>
          </>
        ) : (
          <>
            <p style={{ fontWeight: 600 }}>{group.name}</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>{group.description}</p>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="rb-btn rb-btn--outline" style={smallBtnStyle} onClick={handleCopyInvite}>
            <Link2 size={13} strokeWidth={1.75} /> Copy invite link
          </button>
          <button className="rb-btn rb-btn--outline" style={smallBtnStyle} onClick={() => toggleMuteGroup(group.id, currentUid, !isMuted)}>
            {isMuted ? <Bell size={13} strokeWidth={1.75} /> : <BellOff size={13} strokeWidth={1.75} />} {isMuted ? 'Unmute group' : 'Mute group'}
          </button>
          <button className="rb-btn rb-btn--outline" style={smallBtnStyle} onClick={() => navigate(`/files/groups/${group.id}`)}>
            <FolderOpen size={13} strokeWidth={1.75} /> Shared files
          </button>
        </div>

        {isAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16 }}>
            <input type="checkbox" checked={group.isRoom} onChange={(e) => toggleGroupAsRoom(group.id, e.target.checked)} />
            Turn this group into a Room (adds Notes, Schedule, and a fuller collaboration view)
          </label>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4 style={{ fontSize: 14 }}>Members ({group.members.length})</h4>
          {canManage && (
            <button
              className="rb-btn rb-btn--outline"
              style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => setShowAddMember(true)}
            >
              <UserPlus size={13} strokeWidth={1.75} /> Add member
            </button>
          )}
        </div>

        {group.members.map((uid) => {
          const info = group.memberInfo[uid];
          const memberIsAdmin = group.admins.includes(uid);
          const memberIsCoAdmin = group.coAdmins.includes(uid);
          return (
            <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span style={{ fontSize: 14 }}>
                {info?.displayName ?? uid}{' '}
                {memberIsAdmin && <em style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>(admin)</em>}
                {memberIsCoAdmin && !memberIsAdmin && <em style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>(co-admin)</em>}
              </span>
              {isAdmin && uid !== currentUid && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!memberIsAdmin && (
                    <button className="rb-btn rb-btn--outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => makeAdmin(group.id, uid)}>
                      Make admin
                    </button>
                  )}
                  {!memberIsAdmin && !memberIsCoAdmin && (
                    <button className="rb-btn rb-btn--outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => makeCoAdmin(group.id, uid)}>
                      Make co-admin
                    </button>
                  )}
                  {memberIsCoAdmin && (
                    <button className="rb-btn rb-btn--outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => removeCoAdmin(group.id, uid)}>
                      Remove co-admin
                    </button>
                  )}
                  <button className="rb-btn rb-btn--outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setRemovingUid(uid)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button className="rb-btn rb-btn--outline" style={{ marginTop: 16, width: '100%', color: 'var(--color-danger)' }} onClick={() => setShowLeaveConfirm(true)}>
          Leave group
        </button>
      </div>

      {showAddMember && (
        <AddMemberModal groupId={group.id} existingMemberUids={group.members} onClose={() => setShowAddMember(false)} />
      )}

      {showLeaveConfirm && (
        <ConfirmDialog
          title="Leave this group?"
          message={`You'll stop receiving messages from "${group.name}" unless someone adds you back.`}
          confirmLabel="Leave group"
          danger
          onConfirm={handleLeave}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}

      {removingUid && (
        <ConfirmDialog
          title="Remove this member?"
          message={`${group.memberInfo[removingUid]?.displayName ?? 'This member'} will be removed from the group.`}
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            await removeMember(group.id, removingUid);
            setRemovingUid(null);
          }}
          onCancel={() => setRemovingUid(null)}
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
  zIndex: 100,
};

const smallBtnStyle: React.CSSProperties = { fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5 };