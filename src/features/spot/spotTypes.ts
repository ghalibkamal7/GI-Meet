export interface Spot {
  id: string;
  uid: string;
  authorName: string;
  authorPhoto: string | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'none';
  text: string;
  emoji: string | null;
  createdAt: number;
  expiresAt: number;
  viewedBy: string[];
  reactions: Record<string, string>; // uid -> emoji
}
