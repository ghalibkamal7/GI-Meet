export interface Meeting {
  id: string; // secure random meeting code, also the LiveKit room name
  title: string;
  description: string;
  hostUid: string;
  coHosts: string[];
  groupId: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  locked: boolean;
  isAudioOnly: boolean;
  hasPassword: boolean;
  waitingRoomEnabled: boolean;
  activeParticipants: string[];
  waitingParticipants: string[];
  // Scheduling
  scheduledAt: number | null;
  status: 'instant' | 'scheduled';
  invitedUids: string[];
}

export interface MeetingHistoryEntry {
  id: string;
  meetingId: string;
  title: string;
  hostUid: string;
  participants: string[];
  startTime: number;
  endTime: number | null;
  durationSeconds: number;
}
