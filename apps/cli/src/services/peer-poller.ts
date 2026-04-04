import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';

const SECONDS_TO_MS = 1000;
const HTTP_STATUS_REQUEST_TIMEOUT = 408;
const ERROR_BACKOFF_MS = 5 * SECONDS_TO_MS;
const POLL_CLIENT_TIMEOUT_MS = 35 * SECONDS_TO_MS;

interface PeerInfo {
  id: string;
  name: string;
  joinedAt: string;
}

export async function waitForPeers({
  api,
  roomCode,
  peerId,
  signal,
}: {
  api: AppContext['api'];
  roomCode: string;
  peerId: string;
  signal: AbortSignal;
}): Promise<PeerInfo[]> {
  while (!signal.aborted) {
    try {
      const { data, error } = await api('/rooms/:code/peers', {
        params: { code: roomCode },
        headers: { 'psst-peer-id': peerId },
        signal: AbortSignal.timeout(POLL_CLIENT_TIMEOUT_MS),
      });

      if (error) {
        if (error.status === HTTP_STATUS_REQUEST_TIMEOUT) {
          continue;
        }
        throw new Error(formatEdenError(error));
      }

      if (data.length > 0) {
        return data;
      }
    } catch {
      if (signal.aborted) {
        break;
      }
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }

  return [];
}
