export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  photoURL: string | null;
  createdAt: number;
  lastSeen: number;
  isOnline: boolean;
  bio: string;
  privacy?: {
    showLastSeen: boolean;
    showOnlineStatus: boolean;
  };
  fcmTokens?: string[];
  publicKeyJwk?: string | null;
}