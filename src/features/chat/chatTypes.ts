export interface Chat {
  id: string;
  participants: string[];
  participantInfo: Record<string, { displayName: string; photoURL: string | null }>;
  lastMessage: string;
  lastMessageAt: number;
  lastMessageSenderId: string;
  typing: Record<string, boolean>;
  pinnedMessageIds: string[];
  mutedBy: string[];
  archivedBy: string[];
  hiddenFor: string[];
  lastReadAt: Record<string, number>;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: number;
  editedAt: number | null;
  readBy: string[];
  replyTo: { messageId: string; text: string; senderId: string; iv?: string } | null;
  forwardedFrom: { senderId: string; senderName: string } | null;
  deleted: boolean;
  attachment: MessageAttachment | null;
  reactions: Record<string, string[]>;
  starredBy: string[];
  encrypted: boolean;
  iv: string | null;
}

export interface MessageAttachment {
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds?: number;
  encrypted?: boolean;
  iv?: string | null;
}