import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';

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
  async func(this: AppContext, _flags, code) {
    const displayName = this.config.get('name') ?? 'Anonymous';
    await this.api.joinRoom(code, displayName);
    this.config.setCurrentRoom(code);

    this.process.stdout.write(`\n  Joined room: ${code}\n`);
    this.process.stdout.write("  Run 'psst talk' to start chatting.\n\n");
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [string], AppContext>>[0]);
