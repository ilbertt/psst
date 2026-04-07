import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';
import { startCall } from '#services/call.ts';
import { showTalkingScreen } from '#ui/talking-screen.ts';

const HTTP_STATUS_REQUEST_TIMEOUT = 408;
const POLL_CLIENT_TIMEOUT_MS = 35_000;
const ERROR_BACKOFF_MS = 5_000;

export const createRoom = buildCommand({
  docs: {
    brief: 'Create a room and wait for someone to join',
  },
  parameters: {
    flags: {
      name: {
        kind: 'parsed',
        parse: String,
        brief: 'Your display name (overrides config)',
        optional: true,
      },
    },
  },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, flags) {
    const name = flags.name ?? this.config.name;
    if (name === 'Anonymous') {
      this.process.stderr.write('Set your name first: psst config set name "Your Name"\n');
      this.process.stderr.write('Or use: psst room --name "Your Name"\n');
      return;
    }

    const { data: room, error: createError } = await this.api('/rooms', {
      method: 'POST',
      body: {},
    });
    if (createError) {
      this.process.stderr.write(`Failed to create room: ${formatEdenError(createError)}\n`);
      return;
    }

    const { data: joined, error: joinError } = await this.api('/rooms/:code/join', {
      method: 'POST',
      params: { code: room.code },
      body: { name },
    });
    if (joinError) {
      this.process.stderr.write(`Failed to join room: ${formatEdenError(joinError)}\n`);
      return;
    }

    this.process.stdout.write(`\n  Room created! Share this code: ${room.code}\n`);
    this.process.stdout.write('  Waiting for someone to join...\n\n');

    const peer = await waitForPeer({
      api: this.api,
      roomCode: room.code,
      myPeerId: joined.peerId,
    });

    if (!peer) {
      return;
    }

    this.process.stdout.write(`  ${peer.name} joined! Connecting...\n`);

    const call = await startCall({
      api: this.api,
      roomCode: room.code,
      myPeerId: joined.peerId,
      peer,
    });

    await showTalkingScreen({ peer, stats: call.stats });
    call.stop();
  },
} satisfies Parameters<typeof buildCommand<{ name?: string }, [], AppContext>>[0]);

async function waitForPeer({
  api,
  roomCode,
  myPeerId,
}: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
}): Promise<{ id: string; name: string } | null> {
  while (true) {
    try {
      const { data, error } = await api('/rooms/:code/peers', {
        params: { code: roomCode },
        headers: { 'psst-peer-id': myPeerId },
        signal: AbortSignal.timeout(POLL_CLIENT_TIMEOUT_MS),
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
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }
}
