import { appendFileSync, openSync } from 'node:fs';
import type { AppContext } from '#context.ts';
import type { Peer } from '#types.ts';
import { listenForRtp, startCapture, startPlayback } from './audio.ts';
import helperPath from './mc-helper';

const CALL_LOG_PATH = `/tmp/psst-call-${process.pid}.log`;
const MC_LOG_PATH = `/tmp/psst-mc-${process.pid}.log`;
const MAX_RTP_PACKET = 65535;
const FRAME_HEADER_BYTES = 2;

function logCall({ event, detail }: { event: string; detail?: unknown }): void {
  const line =
    detail === undefined
      ? `${new Date().toISOString()} ${event}\n`
      : `${new Date().toISOString()} ${event} ${JSON.stringify(detail)}\n`;
  try {
    appendFileSync(CALL_LOG_PATH, line);
  } catch {
    // ignore
  }
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

const RTP_HEADER_BYTES = 12;
const VAD_SILENCE_FLOOR = 8;
const VAD_SPEECH_CEIL = 45;
const VAD_SMOOTHING = 0.5;

function payloadToLevel(payloadSize: number): number {
  const range = VAD_SPEECH_CEIL - VAD_SILENCE_FLOOR;
  return Math.max(0, Math.min(1, (payloadSize - VAD_SILENCE_FLOOR) / range));
}

async function startMcCall({
  roomCode,
  peer,
}: {
  roomCode: string;
  peer: Peer;
}): Promise<ActiveCall> {
  logCall({ event: 'mc-start', detail: { peer: peer.id, roomCode } });

  const stats: CallStats = {
    sent: 0,
    received: 0,
    connectionState: 'connecting',
    localLevel: 0,
    remoteLevel: 0,
  };

  logCall({ event: 'capture-begin' });
  const capture = await startCapture();
  logCall({ event: 'capture-ready', detail: { port: capture.port } });
  logCall({ event: 'playback-begin' });
  const playback = await startPlayback();
  logCall({ event: 'playback-ready' });

  logCall({ event: 'helper-spawn', detail: { path: helperPath, roomCode } });
  const helper = Bun.spawn([helperPath, roomCode], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: openSync(MC_LOG_PATH, 'a'),
  });
  logCall({ event: 'helper-spawned', detail: { pid: helper.pid } });

  let stopping = false;

  const rtpListener = listenForRtp({
    port: capture.port,
    onPacket: (data) => {
      if (stopping) {
        return;
      }
      if (data.length === 0 || data.length > MAX_RTP_PACKET) {
        return;
      }
      const header = Buffer.allocUnsafe(FRAME_HEADER_BYTES);
      header.writeUInt16BE(data.length, 0);
      try {
        helper.stdin.write(header);
        helper.stdin.write(data);
      } catch {
        // helper closed
      }
      stats.sent++;
      const payloadSize = Math.max(0, data.length - RTP_HEADER_BYTES);
      stats.localLevel =
        stats.localLevel * VAD_SMOOTHING + payloadToLevel(payloadSize) * (1 - VAD_SMOOTHING);
    },
  });

  // Parse length-prefixed frames from the helper and forward to playback.
  (async () => {
    let buffer = Buffer.alloc(0);
    try {
      for await (const chunk of helper.stdout) {
        if (stopping) {
          return;
        }
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        while (buffer.length >= FRAME_HEADER_BYTES) {
          const len = buffer.readUInt16BE(0);
          const total = FRAME_HEADER_BYTES + len;
          if (buffer.length < total) {
            break;
          }
          const payload = buffer.subarray(FRAME_HEADER_BYTES, total);
          if (stats.received === 0) {
            stats.connectionState = 'connected';
            logCall({ event: 'mc-connected' });
          }
          playback.write(new Uint8Array(payload));
          stats.received++;
          const payloadSize = Math.max(0, payload.length - RTP_HEADER_BYTES);
          stats.remoteLevel =
            stats.remoteLevel * VAD_SMOOTHING + payloadToLevel(payloadSize) * (1 - VAD_SMOOTHING);
          buffer = buffer.subarray(total);
        }
      }
    } catch {
      // helper closed
    }
  })();

  helper.exited.then((code) => {
    logCall({ event: 'mc-exit', detail: { code } });
    if (!stopping) {
      stats.connectionState = 'closed';
    }
  });

  return {
    peer,
    stats,
    stop: () => {
      if (stopping) {
        return;
      }
      stopping = true;
      rtpListener.stop();
      capture.stop();
      playback.stop();
      try {
        helper.stdin.end();
      } catch {
        // already closed
      }
      helper.kill();
    },
  };
}

export async function startCall(opts: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  peer: Peer;
}): Promise<ActiveCall> {
  return startMcCall({ roomCode: opts.roomCode, peer: opts.peer });
}

export async function answerCall(opts: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  peer: Peer;
  offer: unknown;
}): Promise<ActiveCall> {
  return startMcCall({ roomCode: opts.roomCode, peer: opts.peer });
}
