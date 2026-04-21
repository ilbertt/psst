import { appendFileSync, openSync } from 'node:fs';
import type { AppContext } from '#context.ts';
import type { Peer } from '#types.ts';
import helperPath from './mc-helper';

const CALL_LOG_PATH = `/tmp/psst-call-${process.pid}.log`;
const MC_LOG_PATH = `/tmp/psst-mc-${process.pid}.log`;
const HTTP_STATUS_REQUEST_TIMEOUT = 408;
const MC_RENDEZVOUS = { kind: 'mc' as const };

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

  const helper = Bun.spawn([helperPath, roomCode], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: openSync(MC_LOG_PATH, 'a'),
  });
  logCall({ event: 'helper-spawned', detail: { pid: helper.pid } });

  let stopping = false;

  // Tail the MC helper log so the UI can reflect connection state. The
  // helper prints "connected to X" on success.
  const stderrPoller = setInterval(() => {
    if (stopping) {
      return;
    }
    try {
      const contents = require('node:fs').readFileSync(MC_LOG_PATH, 'utf8');
      if (contents.includes('connected to ') && stats.connectionState !== 'connected') {
        stats.connectionState = 'connected';
        logCall({ event: 'mc-connected' });
      }
    } catch {
      // log not yet created
    }
  }, 200);

  helper.exited.then((code) => {
    clearInterval(stderrPoller);
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
      clearInterval(stderrPoller);
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
  logCall({ event: 'startCall', detail: { peer: opts.peer.id } });
  const { error } = await opts.api('/rooms/:code/call/:peerId', {
    method: 'POST',
    params: { code: opts.roomCode, peerId: opts.peer.id },
    headers: { 'psst-peer-id': opts.myPeerId },
    body: { offer: MC_RENDEZVOUS },
  });
  if (error) {
    throw new Error(
      error.status === HTTP_STATUS_REQUEST_TIMEOUT ? 'Call timed out' : 'Call failed',
    );
  }
  return startMcCall({ roomCode: opts.roomCode, peer: opts.peer });
}

export async function answerCall(opts: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  peer: Peer;
  offer: unknown;
}): Promise<ActiveCall> {
  logCall({ event: 'answerCall', detail: { peer: opts.peer.id } });
  await opts.api('/rooms/:code/calls/answer/:peerId', {
    method: 'POST',
    params: { code: opts.roomCode, peerId: opts.peer.id },
    body: { answer: MC_RENDEZVOUS },
  });
  return startMcCall({ roomCode: opts.roomCode, peer: opts.peer });
}
