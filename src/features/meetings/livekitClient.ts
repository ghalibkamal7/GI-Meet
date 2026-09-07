import { Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant } from 'livekit-client';
import { authedFetch } from '../../services/authedFetch';

export async function fetchLiveKitToken(roomName: string, participantName: string): Promise<{ token: string; url: string }> {
  const res = await authedFetch('/api/livekit/token', {
    method: 'POST',
    body: JSON.stringify({ roomName, participantName }),
  });
  if (!res.ok) throw new Error('Could not get a meeting token from the server.');
  return res.json();
}

export interface ConnectResult {
  room: Room;
}

export async function connectToRoom(params: {
  roomName: string;
  participantName: string;
  cameraOn: boolean;
  micOn: boolean;
}): Promise<ConnectResult> {
  const { token, url } = await fetchLiveKitToken(params.roomName, params.participantName);

  const room = new Room({
    adaptiveStream: true, // automatically degrades quality for low-bandwidth participants
    dynacast: true, // reduces server bandwidth for tracks nobody is currently viewing
  });

  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(params.micOn);
  await room.localParticipant.setCameraEnabled(params.cameraOn);

  return { room };
}

export async function toggleScreenShare(room: Room, enable: boolean): Promise<void> {
  await room.localParticipant.setScreenShareEnabled(enable);
}

export function isSpeaking(participant: RemoteParticipant | LocalParticipant): boolean {
  return participant.isSpeaking;
}

export { Room, RoomEvent, Track };
