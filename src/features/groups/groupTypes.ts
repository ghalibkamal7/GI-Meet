export interface Group {
  id: string;
  name: string;
  description: string;
  photoURL: string | null;
  members: string[];
  admins: string[];
  coAdmins: string[];
  memberInfo: Record<string, { displayName: string; photoURL: string | null }>;
  createdBy: string;
  createdAt: number;
  lastMessage: string;
  lastMessageAt: number;
  inviteCode: string;
  mutedBy: string[];
  pinnedMessageIds: string[];
  isRoom: boolean; // Rooms = a Group with extra tabs (Files/Notes/Polls/Schedule) enabled
  communityId: string | null; // set when this group is a sub-group inside a Community
}

export interface Announcement {
  id: string;
  text: string;
  postedBy: string;
  postedByName: string;
  createdAt: number;
}
