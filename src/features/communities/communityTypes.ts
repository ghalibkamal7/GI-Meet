export interface Community {
  id: string;
  name: string;
  description: string;
  photoURL: string | null;
  isPublic: boolean; // public = discoverable and joinable by anyone; private = invite-only
  createdBy: string;
  admins: string[];
  members: string[];
  memberInfo: Record<string, { displayName: string; photoURL: string | null }>;
  groupIds: string[]; // sub-groups that belong to this community
  announcementGroupId: string | null; // a special group all members auto-join, admin-only posting
  inviteCode: string;
  createdAt: number;
}

export interface CommunityAnnouncement {
  id: string;
  text: string;
  postedBy: string;
  postedByName: string;
  createdAt: number;
}
