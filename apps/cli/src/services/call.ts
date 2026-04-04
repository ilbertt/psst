import { MediaStreamTrack, RTCPeerConnection } from 'werift';
import type { AppContext } from '#context.ts';
import type { Peer } from '#types.ts';
import { startCapture, startPlayback } from './audio.ts';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const HTTP_STATUS_REQUEST_TIMEOUT = 408;

export interface ActiveCall {
  peer: Peer;
  stop: () => void;
}

function setupAudioReceiver({
  pc,
  playback,
}: {
  pc: RTCPeerConnection;
  playback: ReturnType<typeof startPlayback>;
}) {
  pc.onTrack.subscribe((track) => {
    track.onReceiveRtp.subscribe((rtp) => {
      playback.write(new Uint8Array(rtp.payload));
    });
  });
}

function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

function setupIceSending({
  pc,
  api,
  roomCode,
  myPeerId,
  targetPeerId,
}: {
  pc: RTCPeerConnection;
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  targetPeerId: string;
}) {
  pc.onIceCandidate.subscribe((candidate) => {
    if (!candidate) {
      return;
    }
    api('/rooms/:code/ice/:peerId', {
      method: 'POST',
      params: { code: roomCode, peerId: targetPeerId },
      headers: { 'psst-peer-id': myPeerId },
      body: { candidate: candidate.toJSON() },
    });
  });
}

export async function startCall({
  api,
  roomCode,
  myPeerId,
  peer,
}: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  peer: Peer;
}): Promise<ActiveCall> {
  const pc = createPeerConnection();
  const capture = startCapture();
  const playback = startPlayback();

  pc.addTrack(new MediaStreamTrack({ kind: 'audio' }));
  setupAudioReceiver({ pc, playback });
  setupIceSending({ pc, api, roomCode, myPeerId, targetPeerId: peer.id });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const { data, error } = await api('/rooms/:code/call/:peerId', {
    method: 'POST',
    params: { code: roomCode, peerId: peer.id },
    headers: { 'psst-peer-id': myPeerId },
    body: { offer: pc.localDescription },
  });

  if (error) {
    pc.close();
    capture.stop();
    playback.stop();
    throw new Error(
      error.status === HTTP_STATUS_REQUEST_TIMEOUT ? 'Call timed out' : 'Call failed',
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: werift expects its own SDP type
  await pc.setRemoteDescription(data.answer as any);
  pollIceCandidates({ api, roomCode, myPeerId, pc });

  return {
    peer,
    stop: () => {
      pc.close();
      capture.stop();
      playback.stop();
    },
  };
}

export async function answerCall({
  api,
  roomCode,
  myPeerId,
  callerPeerId,
  offer,
}: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  callerPeerId: string;
  offer: unknown;
}): Promise<ActiveCall> {
  const pc = createPeerConnection();
  const capture = startCapture();
  const playback = startPlayback();

  pc.addTrack(new MediaStreamTrack({ kind: 'audio' }));
  setupAudioReceiver({ pc, playback });
  setupIceSending({ pc, api, roomCode, myPeerId, targetPeerId: callerPeerId });

  // biome-ignore lint/suspicious/noExplicitAny: werift expects its own SDP type
  await pc.setRemoteDescription(offer as any);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await api('/rooms/:code/calls/answer/:peerId', {
    method: 'POST',
    params: { code: roomCode, peerId: callerPeerId },
    body: { answer: pc.localDescription },
  });

  pollIceCandidates({ api, roomCode, myPeerId, pc });

  return {
    peer: { id: callerPeerId, name: callerPeerId, joinedAt: '' },
    stop: () => {
      pc.close();
      capture.stop();
      playback.stop();
    },
  };
}

async function pollIceCandidates({
  api,
  roomCode,
  myPeerId,
  pc,
}: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  pc: RTCPeerConnection;
}) {
  let active = true;
  pc.connectionStateChange.subscribe((state) => {
    if (state === 'closed' || state === 'failed' || state === 'disconnected') {
      active = false;
    }
  });

  while (active) {
    try {
      const { data, error } = await api('/rooms/:code/ice/poll', {
        params: { code: roomCode },
        headers: { 'psst-peer-id': myPeerId },
        signal: AbortSignal.timeout(35_000),
      });

      if (error) {
        if (error.status === HTTP_STATUS_REQUEST_TIMEOUT) {
          continue;
        }
        break;
      }

      // biome-ignore lint/suspicious/noExplicitAny: werift expects its own ICE type
      await pc.addIceCandidate(data.candidate as any);
    } catch {
      break;
    }
  }
}
