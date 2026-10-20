import { AccessToken, RoomServiceClient, EgressClient, EncodedFileType } from 'livekit-server-sdk';

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const livekitUrl = process.env.LIVEKIT_URL;

function assertConfigured() {
  if (!apiKey || !apiSecret || !livekitUrl) {
    throw new Error(
      'LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL in server/.env ' +
        '(get these from your LiveKit Cloud project or self-hosted server).'
    );
  }
}

const roomServiceUrl = () => livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://');

export async function createParticipantToken(roomName, participantIdentity, participantName) {
  assertConfigured();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: '2m',
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return { token: await token.toJwt(), url: livekitUrl };
}

export async function kickParticipant(roomName, identity) {
  assertConfigured();
  const client = new RoomServiceClient(roomServiceUrl(), apiKey, apiSecret);
  await client.removeParticipant(roomName, identity);
}

/**
 * Host/co-host forcing a participant's mic or camera off. Requires finding
 * the participant's current track SID first (LiveKit mutes by track, not by
 * a simple on/off toggle on the participant).
 */
export async function muteParticipantTrack(roomName, identity, source) {
  assertConfigured();
  const client = new RoomServiceClient(roomServiceUrl(), apiKey, apiSecret);
  const participant = await client.getParticipant(roomName, identity);
  const track = participant.tracks.find((t) => t.source === source || t.name === source);
  if (!track) return; // nothing published of that kind — nothing to mute
  await client.mutePublishedTrack(roomName, identity, track.sid, true);
}

/**
 * Starts a room-composite Egress that pushes the meeting's mixed audio/video
 * to an RTMP URL — this is the "streaming/media server" stage of the
 * pipeline (LiveKit's own Egress service, which runs FFmpeg internally).
 */
export async function startRtmpEgress(roomName, rtmpUrl) {
  assertConfigured();
  const client = new EgressClient(roomServiceUrl(), apiKey, apiSecret);
  const info = await client.startRoomCompositeEgress(roomName, {
    urls: [rtmpUrl],
  });
  return info.egressId;
}

export async function stopEgress(egressId) {
  assertConfigured();
  const client = new EgressClient(roomServiceUrl(), apiKey, apiSecret);
  await client.stopEgress(egressId);
}

export { EncodedFileType };
