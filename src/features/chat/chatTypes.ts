export interface Chat {
  id: string;
  participants: string[]; // exactly 2 uids for 1-1 chats
  participantInfo: Record<string, { displayName: string; photoURL: string | null }>;
  lastMessage: string;
  lastMessageAt: number;
  lastMessageSenderId: string;
  typing: Record<string, boolean>;
  pinnedMessageIds: string[];
  mutedBy: string[];
  archivedBy: string[];
  hiddenFor: string[]; // per-user "delete chat" — hides without deleting the other side's copy
  lastReadAt: Record<string, number>; // uid -> epoch ms, drives unread counts
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: number;
  editedAt: number | null;
  readBy: string[];
  replyTo: { messageId: string; text: string; senderId: string } | null;
  forwardedFrom: { senderId: string; senderName: string } | null;
  deleted: boolean;
  attachment: MessageAttachment | null;
  reactions: Record<string, string[]>; // emoji -> uids who reacted
  starredBy: string[];
}

export interface MessageAttachment {
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds?: number; // for audio/video
}
