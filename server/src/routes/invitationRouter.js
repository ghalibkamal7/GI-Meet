import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';

function publicGroupPreview(id, data, uid) {
  const members = data.members ?? [];
  return {
    id,
    name: data.name,
    description: data.description ?? '',
    membersCount: members.length,
    alreadyMember: members.includes(uid),
  };
}

function publicCommunityPreview(id, data, uid) {
  const members = data.members ?? [];
  return {
    id,
    name: data.name,
    description: data.description ?? '',
    isPublic: Boolean(data.isPublic),
    membersCount: members.length,
    groupsCount: (data.groupIds ?? []).length,
    alreadyMember: members.includes(uid),
  };
}

async function findInvite(db, collectionName, code) {
  const snapshot = await db.collection(collectionName)
    .where('inviteCode', '==', code)
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0];
}

export function createInvitationRouter({
  db,
  verifyFirebaseAuth,
  arrayUnion = FieldValue.arrayUnion,
}) {
  const router = Router();

  router.get('/resolve', verifyFirebaseAuth, async (req, res) => {
    const { type, code } = req.query;
    if (!['group', 'community'].includes(type) || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ message: 'A valid invite type and code are required.' });
    }

    try {
      const invite = await findInvite(db, type === 'group' ? 'groups' : 'communities', code.trim());
      if (!invite) return res.status(404).json({ message: 'This invite link is invalid or has expired.' });
      const data = invite.data();
      res.json(type === 'group'
        ? publicGroupPreview(invite.id, data, req.uid)
        : publicCommunityPreview(invite.id, data, req.uid));
    } catch {
      res.status(500).json({ message: 'Could not validate this invite. Please try again.' });
    }
  });

  router.post('/join', verifyFirebaseAuth, async (req, res) => {
    const { type, code, communityId } = req.body ?? {};
    if (type === 'group' && (typeof code !== 'string' || !code.trim())) {
      return res.status(400).json({ message: 'A group invite code is required.' });
    }
    if (type === 'community' && !(
      (typeof code === 'string' && code.trim())
      || (typeof communityId === 'string' && communityId.trim())
    )) {
      return res.status(400).json({ message: 'A community invite code or public community ID is required.' });
    }
    if (!['group', 'community'].includes(type)) {
      return res.status(400).json({ message: 'A valid invite type is required.' });
    }

    try {
      const userSnapshot = await db.collection('users').doc(req.uid).get();
      if (!userSnapshot.exists) {
        return res.status(403).json({ message: 'Complete profile setup before joining.' });
      }
      const userData = userSnapshot.data();
      const memberInfo = {
        displayName: typeof userData.displayName === 'string' ? userData.displayName : req.uid,
        photoURL: typeof userData.photoURL === 'string' ? userData.photoURL : null,
      };

      const target = type === 'group'
        ? await findInvite(db, 'groups', code.trim())
        : typeof code === 'string' && code.trim()
          ? await findInvite(db, 'communities', code.trim())
          : await db.collection('communities').doc(communityId.trim()).get();

      if (!target || !target.exists) {
        return res.status(404).json({ message: 'This invite link is invalid or has expired.' });
      }

      const targetRef = target.ref;
      let alreadyMember = false;

      await db.runTransaction(async (transaction) => {
        const currentTarget = await transaction.get(targetRef);
        if (!currentTarget.exists) throw new Error('invite-not-found');
        const data = currentTarget.data();

        if (type === 'group') {
          if (data.inviteCode !== code.trim()) throw new Error('invite-not-found');
          const members = data.members ?? [];
          alreadyMember = members.includes(req.uid);
          if (!alreadyMember) {
            transaction.update(targetRef, {
              members: arrayUnion(req.uid),
              [`memberInfo.${req.uid}`]: memberInfo,
            });
          }
          return;
        }

        if (typeof code === 'string' && code.trim()) {
          if (data.inviteCode !== code.trim()) throw new Error('invite-not-found');
        } else if (!data.isPublic) {
          throw new Error('private-community-requires-invite');
        }

        alreadyMember = (data.members ?? []).includes(req.uid);
        if (alreadyMember) return;

        const update = {
          members: arrayUnion(req.uid),
          [`memberInfo.${req.uid}`]: memberInfo,
        };
        const announcementGroupId = data.announcementGroupId;
        let announcementGroupRef = null;
        if (announcementGroupId) {
          announcementGroupRef = db.collection('groups').doc(announcementGroupId);
          const announcementGroup = await transaction.get(announcementGroupRef);
          if (!announcementGroup.exists) throw new Error('community-announcement-group-missing');
          const announcementData = announcementGroup.data();
          if (
            announcementData.communityId !== currentTarget.id
            || !(data.groupIds ?? []).includes(announcementGroupId)
          ) {
            throw new Error('community-announcement-group-mismatch');
          }
        }

        transaction.update(targetRef, update);
        if (announcementGroupRef) {
          transaction.update(announcementGroupRef, {
            members: arrayUnion(req.uid),
            [`memberInfo.${req.uid}`]: memberInfo,
          });
        }
      });

      res.json({ id: targetRef.id, alreadyMember });
    } catch (error) {
      if (error.message === 'invite-not-found') {
        return res.status(404).json({ message: 'This invite link is invalid or has expired.' });
      }
      if (error.message === 'private-community-requires-invite') {
        return res.status(403).json({ message: 'Private communities require a valid invite link.' });
      }
      if (error.message === 'community-announcement-group-missing') {
        return res.status(409).json({ message: 'The community announcement group is unavailable.' });
      }
      if (error.message === 'community-announcement-group-mismatch') {
        return res.status(409).json({ message: 'The community announcement group is misconfigured.' });
      }
      res.status(500).json({ message: 'Could not join. Please try again.' });
    }
  });

  return router;
}
