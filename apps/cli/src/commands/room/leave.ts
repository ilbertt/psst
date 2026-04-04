import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';

export const leaveRoom = buildCommand({
  docs: {
    brief: 'Leave the current room',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    const roomCode = this.config.getCurrentRoom();
    if (!roomCode) {
      this.process.stderr.write('Not in a room.\n');
      return;
    }

    await this.api.leaveRoom(roomCode);
    this.config.clearCurrentRoom();

    this.process.stdout.write(`\n  Left room ${roomCode}.\n\n`);
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
