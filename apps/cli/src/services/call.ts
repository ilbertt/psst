import { MediaStreamTrack, RTCPeerConnection } from 'werift';
import type { AppContext } from '#context.ts';
import type { Peer } from '#types.ts';
import { listenForRtp, startCapture, startPlayback } from './audio.ts';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const HTTP_STATUS_REQUEST_TIMEOUT = 408;

export interface CallStats {
  sent: number;
  received: number;
  connectionState: string;
}

export interface ActiveCall {
  peer: Peer;
  stats: CallStats;
  stop: () => void;
}

async function setupAudio({
  pc,
  stats,
}: {
  pc: RTCPeerConnection;
  stats: CallStats;
}): Promise<{ stop: () => void }> {
  const audioTrack = new MediaStreamTrack({ kind: 'audio' });
  pc.addTrack(audioTrack);

  const capture = await startCapture();
  const playback = startPlayback();

  const rtpListener = listenForRtp({
    port: capture.port,
    onPacket: (data) => {
      audioTrack.writeRtp(data);
      stats.sent++;
    },
  });

  pc.onTrack.subscribe((remoteTrack) => {
    remoteTrack.onReceiveRtp.subscribe((rtp) => {
      playback.write(new Uint8Array(rtp.payload));
      stats.received++;
    });
  });

  return {
    stop: () => {
      capture.stop();
      playback.stop();
      rtpListener.stop();
    },
  };
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
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const stats: CallStats = { sent: 0, received: 0, connectionState: 'new' };
  pc.connectionStateChange.subscribe((state) => {
    stats.connectionState = state;
  });
  const audio = await setupAudio({ pc, stats });
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
    audio.stop();
    throw new Error(
      error.status === HTTP_STATUS_REQUEST_TIMEOUT ? 'Call timed out' : 'Call failed',
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: werift expects its own SDP type
  await pc.setRemoteDescription(data.answer as any);
  pollIceCandidates({ api, roomCode, myPeerId, pc });

  return {
    peer,
    stats,
    stop: () => {
      pc.close();
      audio.stop();
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
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const stats: CallStats = { sent: 0, received: 0, connectionState: 'new' };
  pc.connectionStateChange.subscribe((state) => {
    stats.connectionState = state;
  });
  const audio = await setupAudio({ pc, stats });
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
    stats,
    stop: () => {
      pc.close();
      audio.stop();
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
