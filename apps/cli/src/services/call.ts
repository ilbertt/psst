import { MediaStreamTrack, RTCPeerConnection } from 'werift';
import type { AppContext } from '#context.ts';
import type { Peer } from '#types.ts';
import { listenForRtp, startCapture, startPlayback } from './audio.ts';

const HTTP_STATUS_REQUEST_TIMEOUT = 408;

type RTCIceServer = { urls: string; username?: string; credential?: string };

async function fetchIceServers(api: AppContext['api']): Promise<RTCIceServer[]> {
  const { data, error } = await api('/turn/credentials', {});
  if (error) {
    throw new Error('Failed to fetch ICE servers from psst server');
  }
  return data.flatMap((server) =>
    server.urls.map((url) => ({
      urls: url,
      username: server.username,
      credential: server.credential,
    })),
  );
}

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

interface PeerConnectionContext {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  targetPeerId: string;
}

async function createPeerConnection(ctx: PeerConnectionContext): Promise<{
  pc: RTCPeerConnection;
  stats: CallStats;
  stop: () => void;
}> {
  const iceServers = await fetchIceServers(ctx.api);
  const pc = new RTCPeerConnection({ iceServers });
  const stats: CallStats = { sent: 0, received: 0, connectionState: 'new' };

  pc.connectionStateChange.subscribe((state) => {
    stats.connectionState = state;
  });

  const audioTrack = new MediaStreamTrack({ kind: 'audio' });
  pc.addTrack(audioTrack);

  const capture = await startCapture();
  const playback = await startPlayback();

  const rtpListener = listenForRtp({
    port: capture.port,
    onPacket: (data) => {
      audioTrack.writeRtp(data);
      stats.sent++;
    },
  });

  pc.onTrack.subscribe((remoteTrack) => {
    remoteTrack.onReceiveRtp.subscribe((rtp) => {
      playback.write(new Uint8Array(rtp.serialize()));
      stats.received++;
    });
  });

  pc.onIceCandidate.subscribe((candidate) => {
    if (!candidate) {
      return;
    }
    ctx.api('/rooms/:code/ice/:peerId', {
      method: 'POST',
      params: { code: ctx.roomCode, peerId: ctx.targetPeerId },
      headers: { 'psst-peer-id': ctx.myPeerId },
      body: { candidate: candidate.toJSON() },
    });
  });

  return {
    pc,
    stats,
    stop: () => {
      pc.close();
      rtpListener.stop();
      capture.stop();
      playback.stop();
    },
  };
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
  const { pc, stats, stop } = await createPeerConnection({
    api,
    roomCode,
    myPeerId,
    targetPeerId: peer.id,
  });

  pollIceCandidates({ api, roomCode, myPeerId, pc });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const { data, error } = await api('/rooms/:code/call/:peerId', {
    method: 'POST',
    params: { code: roomCode, peerId: peer.id },
    headers: { 'psst-peer-id': myPeerId },
    body: { offer: pc.localDescription },
  });

  if (error) {
    stop();
    throw new Error(
      error.status === HTTP_STATUS_REQUEST_TIMEOUT ? 'Call timed out' : 'Call failed',
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: werift expects its own SDP type
  await pc.setRemoteDescription(data.answer as any);

  return { peer, stats, stop };
}

export async function answerCall({
  api,
  roomCode,
  myPeerId,
  peer,
  offer,
}: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  peer: Peer;
  offer: unknown;
}): Promise<ActiveCall> {
  const { pc, stats, stop } = await createPeerConnection({
    api,
    roomCode,
    myPeerId,
    targetPeerId: peer.id,
  });

  pollIceCandidates({ api, roomCode, myPeerId, pc });

  // biome-ignore lint/suspicious/noExplicitAny: werift expects its own SDP type
  await pc.setRemoteDescription(offer as any);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await api('/rooms/:code/calls/answer/:peerId', {
    method: 'POST',
    params: { code: roomCode, peerId: peer.id },
    body: { answer: pc.localDescription },
  });

  return { peer, stats, stop };
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
