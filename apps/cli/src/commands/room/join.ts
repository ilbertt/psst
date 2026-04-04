import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';

export const joinRoom = buildCommand({
  docs: {
    brief: 'Join a room by code',
    customUsage: [
      {
        input: 'psst room join ABC123',
        brief: 'Join a room',
      },
    ],
  },
  parameters: {
    flags: {},
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Room code',
          parse: String,
        },
      ],
    },
  },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags, code) {
    const displayName = this.config.get('name') ?? 'Anonymous';
    const { data, error } = await this.api('/rooms/:code/join', {
      method: 'POST',
      params: { code },
      body: { name: displayName },
    });

    if (error) {
      this.process.stderr.write(`Failed to join room: ${formatEdenError(error)}\n`);
      return;
    }

    this.config.setCurrentRoom(code);
    this.config.set({ key: 'peerId', value: data.peerId });
    this.process.stdout.write(`\n  Joined room: ${code}\n`);
    this.process.stdout.write("  Run 'psst talk' to start chatting.\n\n");
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [string], AppContext>>[0]);
