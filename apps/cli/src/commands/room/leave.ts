import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';

export const leaveRoom = buildCommand({
  docs: {
    brief: 'Leave the current room',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    const room = this.config.getCurrentRoom();
    if (!room) {
      this.process.stderr.write('Not in a room.\n');
      return;
    }

    this.config.clearCurrentRoom();
    this.process.stdout.write(`\n  Left room ${room.code}.\n\n`);
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
