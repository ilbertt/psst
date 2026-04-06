import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';
import { answerCall } from '#services/call.ts';
import { showTalkingScreen } from '#ui/talking-screen.ts';

const HTTP_STATUS_REQUEST_TIMEOUT = 408;
const POLL_CLIENT_TIMEOUT_MS = 35_000;
const ERROR_BACKOFF_MS = 5_000;

export const joinRoom = buildCommand({
  docs: {
    brief: 'Join a room by code',
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
    positional: {
      kind: 'tuple',
      parameters: [{ brief: 'Room code', parse: String }],
    },
  },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, flags, code) {
    const name = flags.name ?? this.config.name;
    if (name === 'Anonymous') {
      this.process.stderr.write('Set your name first: psst config set name "Your Name"\n');
      this.process.stderr.write('Or use: psst room join <code> --name "Your Name"\n');
      return;
    }

    const { data: joined, error: joinError } = await this.api('/rooms/:code/join', {
      method: 'POST',
      params: { code },
      body: { name },
    });
    if (joinError) {
      this.process.stderr.write(`Failed to join room: ${formatEdenError(joinError)}\n`);
      return;
    }

    this.process.stdout.write(`\n  Joined room ${code}. Waiting for call...\n\n`);

    const incoming = await waitForCall({
      api: this.api,
      roomCode: code,
      myPeerId: joined.peerId,
    });

    if (!incoming) {
      return;
    }

    this.process.stdout.write('  Incoming call! Connecting...\n');

    const call = await answerCall({
      api: this.api,
      roomCode: code,
      myPeerId: joined.peerId,
      callerPeerId: incoming.from,
      offer: incoming.offer,
    });

    await showTalkingScreen({ peer: call.peer, stats: call.stats });
    call.stop();
  },
} satisfies Parameters<typeof buildCommand<{ name?: string }, [string], AppContext>>[0]);

async function waitForCall({
  api,
  roomCode,
  myPeerId,
}: {
  api: AppContext['api'];
  roomCode: string;
  myPeerId: string;
}): Promise<{ from: string; offer: unknown } | null> {
  while (true) {
    try {
      const { data, error } = await api('/rooms/:code/calls/poll', {
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

      return data;
    } catch {
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }
}
