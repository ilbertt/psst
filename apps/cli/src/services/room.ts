import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';
import type { Peer } from '#types.ts';

const HTTP_STATUS_REQUEST_TIMEOUT = 408;
const POLL_CLIENT_TIMEOUT_MS = 35_000;
const ERROR_BACKOFF_MS = 5_000;

export interface JoinedRoom {
  code: string;
  peerId: string;
}

export interface IncomingCall {
  from: string;
  offer: unknown;
}

export async function createRoom(opts: {
  api: AppContext['api'];
  name: string;
}): Promise<JoinedRoom> {
  const { data: room, error: createError } = await opts.api('/rooms', {
    method: 'POST',
    body: {},
  });
  if (createError) {
    throw new Error(`Failed to create room: ${formatEdenError(createError)}`);
  }

  const { data: joined, error: joinError } = await opts.api('/rooms/:code/join', {
    method: 'POST',
    params: { code: room.code },
    body: { name: opts.name },
  });
  if (joinError) {
    throw new Error(`Failed to join room: ${formatEdenError(joinError)}`);
  }

  return { code: room.code, peerId: joined.peerId };
}

export async function joinRoomByCode(opts: {
  api: AppContext['api'];
  code: string;
  name: string;
}): Promise<JoinedRoom> {
  const { data: joined, error } = await opts.api('/rooms/:code/join', {
    method: 'POST',
    params: { code: opts.code },
    body: { name: opts.name },
  });
  if (error) {
    throw new Error(`Failed to join room: ${formatEdenError(error)}`);
  }
  return { code: opts.code, peerId: joined.peerId };
}

export async function waitForPeer(opts: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  signal?: AbortSignal;
}): Promise<Peer | null> {
  while (!opts.signal?.aborted) {
    try {
      const { data, error } = await opts.api('/rooms/:code/peers', {
        params: { code: opts.roomCode },
        headers: { 'psst-peer-id': opts.myPeerId },
        signal: AbortSignal.any([
          AbortSignal.timeout(POLL_CLIENT_TIMEOUT_MS),
          ...(opts.signal ? [opts.signal] : []),
        ]),
      });

      if (error) {
        if (error.status === HTTP_STATUS_REQUEST_TIMEOUT) {
          continue;
        }
        return null;
      }

      if (data.length > 0) {
        return data[0]!;
      }
    } catch {
      if (opts.signal?.aborted) {
        return null;
      }
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }
  return null;
}

export async function waitForCall(opts: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  signal?: AbortSignal;
}): Promise<IncomingCall | null> {
  while (!opts.signal?.aborted) {
    try {
      const { data, error } = await opts.api('/rooms/:code/calls/poll', {
        params: { code: opts.roomCode },
        headers: { 'psst-peer-id': opts.myPeerId },
        signal: AbortSignal.any([
          AbortSignal.timeout(POLL_CLIENT_TIMEOUT_MS),
          ...(opts.signal ? [opts.signal] : []),
        ]),
      });

      if (error) {
        if (error.status === HTTP_STATUS_REQUEST_TIMEOUT) {
          continue;
        }
        return null;
      }

      return data;
    } catch {
      if (opts.signal?.aborted) {
        return null;
      }
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }
  return null;
}

export async function getPeerName(opts: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
  peerId: string;
}): Promise<string> {
  const { data: peers } = await opts.api('/rooms/:code/peers', {
    params: { code: opts.roomCode },
    headers: { 'psst-peer-id': opts.myPeerId },
  });
  return peers?.find((p) => p.id === opts.peerId)?.name ?? opts.peerId;
}
