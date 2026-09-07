import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';

export type LiveEventPayload =
  | { type: 'reaction'; emoji: string; from: string }
  | { type: 'raise-hand'; on: boolean; from: string };

export function broadcastLiveEvent(room: Room, payload: LiveEventPayload): void {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  room.localParticipant.publishData(data, { reliable: true });
}

export function subscribeToLiveEvents(room: Room, onEvent: (payload: LiveEventPayload, participant?: RemoteParticipant) => void) {
  const handler = (payload: Uint8Array, participant?: RemoteParticipant) => {
    try {
      const decoded = JSON.parse(new TextDecoder().decode(payload)) as LiveEventPayload;
      onEvent(decoded, participant);
    } catch {
      // Ignore malformed packets rather than crash the meeting.
    }
  };
  room.on(RoomEvent.DataReceived, handler);
  return () => room.off(RoomEvent.DataReceived, handler);
}
