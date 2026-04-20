import { appendFileSync } from 'node:fs';
import {
  Audio,
  type IceServer,
  initLogger,
  PeerConnection,
  RtcpReceivingSession,
  type Track,
} from 'node-datachannel';
import type { AppContext } from '#context.ts';
import type { Peer } from '#types.ts';
import { listenForRtp, startCapture, startPlayback } from './audio.ts';

const HTTP_STATUS_REQUEST_TIMEOUT = 408;
const OPUS_PAYLOAD_TYPE = 111;
const OPUS_SSRC = 0x10000000 + Math.floor(Math.random() * 0x7fffffff);
const RTP_SSRC_OFFSET = 8;
const CALL_LOG_PATH = `/tmp/psst-call-${process.pid}.log`;
const NDC_LOG_PATH = `/tmp/psst-ndc-${process.pid}.log`;

let loggerInitialized = false;
function initNdcLogger(): void {
  if (loggerInitialized) {
    return;
  }
  loggerInitialized = true;
  // biome-ignore lint/complexity/useMaxParams: node-datachannel callback signature
  initLogger('Debug', (level, msg) => {
    try {
      appendFileSync(NDC_LOG_PATH, `${new Date().toISOString()} [${level}] ${msg}\n`);
    } catch {
      // ignore
    }
  });
}

function logCall({ event, detail }: { event: string; detail?: unknown }): void {
  const line =
    detail === undefined
      ? `${new Date().toISOString()} ${event}\n`
      : `${new Date().toISOString()} ${event} ${JSON.stringify(detail)}\n`;
  try {
    appendFileSync(CALL_LOG_PATH, line);
  } catch {
    // ignore log failures
  }
}

function parseHostPort(url: string): { hostname: string; port: number } {
  // Accepts "turn:host:port?transport=udp", "stun:host:port", etc.
  const stripped = url.replace(/^[a-z]+:/, '').split('?')[0]!;
  const [hostname, portStr] = stripped.split(':');
  return { hostname: hostname!, port: Number(portStr) || 3478 };
}

function urlToRelayType(url: string): IceServer['relayType'] {
  if (url.startsWith('turns:')) {
    return 'TurnTls';
  }
  if (url.includes('transport=tcp')) {
    return 'TurnTcp';
  }
  return 'TurnUdp';
}

async function fetchIceServers(api: AppContext['api']): Promise<IceServer[]> {
  const { data, error } = await api('/turn/credentials', {});
  if (error) {
    throw new Error('Failed to fetch ICE servers from psst server');
  }
  return data.flatMap((server) =>
    server.urls.map((url): IceServer => {
      const { hostname, port } = parseHostPort(url);
      if (url.startsWith('stun:')) {
        return { hostname, port };
      }
      return {
        hostname,
        port,
        username: server.username,
        password: server.credential,
        relayType: urlToRelayType(url),
      };
    }),
  );
}

export interface CallStats {
  sent: number;
  received: number;
  connectionState: string;
  localLevel: number;
  remoteLevel: number;
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

const RTP_HEADER_BYTES = 12;
const VAD_SILENCE_FLOOR = 8;
const VAD_SPEECH_CEIL = 45;
const VAD_SMOOTHING = 0.5;

function payloadToLevel(payloadSize: number): number {
  const range = VAD_SPEECH_CEIL - VAD_SILENCE_FLOOR;
  return Math.max(0, Math.min(1, (payloadSize - VAD_SILENCE_FLOOR) / range));
}

async function createPeerConnection(ctx: PeerConnectionContext): Promise<{
  pc: PeerConnection;
  stats: CallStats;
  stop: () => void;
}> {
  initNdcLogger();
  const iceServers = await fetchIceServers(ctx.api);
  logCall({
    event: 'ice-servers',
    detail: {
      count: iceServers.length,
      hasTurn: iceServers.some((s) => s.relayType !== undefined),
    },
  });

  const pc = new PeerConnection(ctx.myPeerId, {
    iceServers,
    iceTransportPolicy: 'all',
  });
  const stats: CallStats = {
    sent: 0,
    received: 0,
    connectionState: 'new',
    localLevel: 0,
    remoteLevel: 0,
  };
  let localCandidates = 0;

  pc.onStateChange((state) => {
    logCall({ event: 'pc-state', detail: state });
  });
  pc.onIceStateChange((state) => {
    // node-datachannel's onStateChange rarely transitions past 'connecting';
    // the ICE state is the reliable source of truth for UI.
    stats.connectionState = state === 'completed' ? 'connected' : state;
    logCall({ event: 'ice-state', detail: state });
  });
  pc.onGatheringStateChange((state) => {
    logCall({ event: 'ice-gathering', detail: state });
  });

  const audio = new Audio('audio', 'SendRecv');
  audio.addOpusCodec(OPUS_PAYLOAD_TYPE);
  audio.setBitrate(64_000);
  audio.addSSRC(OPUS_SSRC, 'psst-audio');
  const localTrack = pc.addTrack(audio);
  // libdatachannel's media-receiver example attaches an RtcpReceivingSession
  // so RTCP flows and the remote keeps sending media.
  localTrack.setMediaHandler(new RtcpReceivingSession());

  const capture = await startCapture();
  const playback = await startPlayback();

  let stopping = false;

  const rtpListener = listenForRtp({
    port: capture.port,
    onPacket: (data) => {
      if (stopping) {
        return;
      }
      if (data.length < RTP_HEADER_BYTES) {
        return;
      }
      // libdatachannel requires the RTP packet's SSRC field to match the
      // SSRC declared in SDP (see libdatachannel media-sender example).
      // ffmpeg picks a random SSRC; rewrite it to the declared one.
      data.writeUInt32BE(OPUS_SSRC, RTP_SSRC_OFFSET);
      if (localTrack.isOpen()) {
        try {
          localTrack.sendMessageBinary(data);
        } catch {
          // track closed between isOpen() check and send — drop packet
        }
      }
      stats.sent++;
      const payloadSize = data.length - RTP_HEADER_BYTES;
      stats.localLevel =
        stats.localLevel * VAD_SMOOTHING + payloadToLevel(payloadSize) * (1 - VAD_SMOOTHING);
    },
  });

  const attachRemote = (track: Track) => {
    track.onMessage((data) => {
      if (stopping) {
        return;
      }
      if (data.length < RTP_HEADER_BYTES) {
        return;
      }
      // Drop RTCP (RFC 5761 payload types 72–76) so only RTP reaches ffmpeg.
      const packetType = data[1]! & 0x7f;
      if (packetType >= 72 && packetType <= 76) {
        return;
      }
      playback.write(new Uint8Array(data));
      stats.received++;
      const payloadSize = data.length - RTP_HEADER_BYTES;
      stats.remoteLevel =
        stats.remoteLevel * VAD_SMOOTHING + payloadToLevel(payloadSize) * (1 - VAD_SMOOTHING);
    });
  };

  pc.onTrack((track) => {
    attachRemote(track);
  });
  attachRemote(localTrack);

  const statsLogger = setInterval(() => {
    if (stopping) {
      return;
    }
    logCall({
      event: 'rtp-counters',
      detail: { sent: stats.sent, received: stats.received },
    });
  }, 2000);

  // biome-ignore lint/complexity/useMaxParams: node-datachannel callback signature
  pc.onLocalCandidate((candidate, mid) => {
    localCandidates++;
    logCall({
      event: 'local-candidate',
      detail: { n: localCandidates, candidate, mid },
    });
    ctx.api('/rooms/:code/ice/:peerId', {
      method: 'POST',
      params: { code: ctx.roomCode, peerId: ctx.targetPeerId },
      headers: { 'psst-peer-id': ctx.myPeerId },
      body: { candidate: { candidate, mid } },
    });
  });

  return {
    pc,
    stats,
    stop: () => {
      if (stopping) {
        return;
      }
      stopping = true;
      clearInterval(statsLogger);
      // Order matters: stop the sources of native calls BEFORE destroying
      // the PeerConnection, or libdatachannel throws a C++ exception on
      // sendMessageBinary/playback.write against freed native memory.
      rtpListener.stop();
      capture.stop();
      playback.stop();
      try {
        pc.close();
      } catch {
        // already closed
      }
    },
  };
}

interface SignalDescription {
  sdp: string;
  type: 'offer' | 'answer';
}

function waitForLocalDescription(pc: PeerConnection): Promise<SignalDescription> {
  return new Promise((resolve) => {
    // biome-ignore lint/complexity/useMaxParams: node-datachannel callback signature
    pc.onLocalDescription((sdp, type) => {
      if (type === 'offer' || type === 'answer') {
        resolve({ sdp, type });
      }
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
  logCall({ event: 'startCall', detail: { peer: peer.id, role: 'caller' } });
  const { pc, stats, stop } = await createPeerConnection({
    api,
    roomCode,
    myPeerId,
    targetPeerId: peer.id,
  });

  const readyPromise = waitForLocalDescription(pc);
  pc.setLocalDescription();
  const localDesc = await readyPromise;
  logCall({ event: 'local-description-set', detail: 'offer' });

  const { data, error } = await api('/rooms/:code/call/:peerId', {
    method: 'POST',
    params: { code: roomCode, peerId: peer.id },
    headers: { 'psst-peer-id': myPeerId },
    body: { offer: localDesc },
  });

  if (error) {
    stop();
    throw new Error(
      error.status === HTTP_STATUS_REQUEST_TIMEOUT ? 'Call timed out' : 'Call failed',
    );
  }

  const answer = data.answer as SignalDescription;
  pc.setRemoteDescription(answer.sdp, answer.type);
  logCall({ event: 'remote-description-set', detail: 'answer' });

  pollIceCandidates({ api, roomCode, myPeerId, pc });

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
  logCall({ event: 'answerCall', detail: { peer: peer.id, role: 'callee' } });
  const { pc, stats, stop } = await createPeerConnection({
    api,
    roomCode,
    myPeerId,
    targetPeerId: peer.id,
  });

  const offerDesc = offer as SignalDescription;
  const readyPromise = waitForLocalDescription(pc);
  pc.setRemoteDescription(offerDesc.sdp, offerDesc.type);
  logCall({ event: 'remote-description-set', detail: 'offer' });

  const localDesc = await readyPromise;
  logCall({ event: 'local-description-set', detail: 'answer' });

  await api('/rooms/:code/calls/answer/:peerId', {
    method: 'POST',
    params: { code: roomCode, peerId: peer.id },
    body: { answer: localDesc },
  });

  pollIceCandidates({ api, roomCode, myPeerId, pc });

  return { peer, stats, stop };
}

interface RemoteCandidate {
  candidate: string;
  mid: string;
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
  pc: PeerConnection;
}) {
  let active = true;
  pc.onStateChange((state) => {
    if (state === 'closed' || state === 'failed' || state === 'disconnected') {
      active = false;
    }
  });

  logCall({ event: 'ice-poll-start' });

  while (active) {
    const { data, error } = await api('/rooms/:code/ice/poll', {
      params: { code: roomCode },
      headers: { 'psst-peer-id': myPeerId },
      signal: AbortSignal.timeout(35_000),
    }).catch(() => ({ data: undefined, error: { status: 0 } }));

    if (error) {
      if (error.status === HTTP_STATUS_REQUEST_TIMEOUT) {
        continue;
      }
      if (!active) {
        break;
      }
      continue;
    }

    const remote = data.candidate as RemoteCandidate;
    logCall({ event: 'remote-candidate', detail: remote });
    try {
      pc.addRemoteCandidate(remote.candidate, remote.mid);
    } catch (err) {
      logCall({
        event: 'remote-candidate-error',
        detail: { message: (err as Error).message },
      });
    }
  }
}
