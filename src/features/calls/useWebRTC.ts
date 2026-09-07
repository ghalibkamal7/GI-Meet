import { useEffect, useRef, useState } from 'react';
import {
  RTC_CONFIG,
  setOffer,
  setAnswer,
  subscribeToRemoteDescription,
  addIceCandidate,
  subscribeToIceCandidates,
} from './callService';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';

interface Params {
  callId: string;
  role: 'caller' | 'callee';
  callType: 'voice' | 'video';
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: ConnectionState) => void;
}

/**
 * Encapsulates the full offer/answer/ICE dance for a single 1-1 call.
 * The caller creates+sends the offer; the callee waits for it, answers,
 * and both sides stream their local ICE candidates to Firestore.
 */
export function useWebRTC({ callId, role, callType, onRemoteStream, onConnectionStateChange }: Params) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(callType === 'video');

  useEffect(() => {
    let cancelled = false;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') onConnectionStateChange('connected');
      else if (state === 'disconnected' || state === 'closed') onConnectionStateChange('disconnected');
      else if (state === 'failed') onConnectionStateChange('failed');
      else onConnectionStateChange('connecting');
    };

    pc.ontrack = (event) => {
      onRemoteStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addIceCandidate(callId, role, event.candidate.toJSON());
      }
    };

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video',
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        if (role === 'caller') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setOffer(callId, offer);
        } else {
          const unsubscribeOffer = subscribeToRemoteDescription(callId, 'offer', async (offerDesc) => {
            if (pc.currentRemoteDescription) return;
            await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await setAnswer(callId, answer);
          });
          return () => unsubscribeOffer();
        }
      } catch (err) {
        // Never assume permission is granted — handle denial/unavailable devices gracefully.
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera/microphone access was denied. Please allow access to join the call.'
            : 'Could not access camera/microphone. Check that a device is connected and not in use elsewhere.';
        setMediaError(message);
      }
    }

    const cleanupPromise = setup();

    let unsubscribeAnswer: (() => void) | undefined;
    if (role === 'caller') {
      unsubscribeAnswer = subscribeToRemoteDescription(callId, 'answer', async (answerDesc) => {
        if (pc.currentRemoteDescription) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
      });
    }

    const remoteRole = role === 'caller' ? 'callee' : 'caller';
    const unsubscribeIce = subscribeToIceCandidates(callId, remoteRole, (candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
    });

    return () => {
      cancelled = true;
      cleanupPromise.then((fn) => fn?.());
      unsubscribeAnswer?.();
      unsubscribeIce();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pc.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, role, callType]);

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  }

  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraOn(track.enabled);
    }
  }

  function hangUp() {
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
  }

  return { localStream, mediaError, micOn, cameraOn, toggleMic, toggleCamera, hangUp };
}
