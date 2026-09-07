export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  photoURL: string | null;
  createdAt: number; // epoch ms
  lastSeen: number; // epoch ms
  isOnline: boolean;
  bio: string;
  privacy?: {
    showLastSeen: boolean;
    showOnlineStatus: boolean;
  };
  fcmTokens?: string[];
}
