import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';

const POLL_INTERVAL_MS = 3000;

interface PeerInfo {
  id: string;
  name: string;
  joinedAt: string;
}

export async function waitForPeers({
  api,
  roomCode,
  signal,
}: {
  api: AppContext['api'];
  roomCode: string;
  signal: AbortSignal;
}): Promise<PeerInfo[]> {
  while (!signal.aborted) {
    const { data, error } = await api('/rooms/:code/peers', {
      params: { code: roomCode },
    });

    if (error) {
      throw new Error(`Failed to get peers: ${formatEdenError(error)}`);
    }

    if (data.length > 0) {
      return data;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return [];
}
