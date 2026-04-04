import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';

export const createRoom = buildCommand({
  docs: {
    brief: 'Create a new room and get a share code',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    const room = await this.api.createRoom();
    this.config.setCurrentRoom(room.code);

    this.process.stdout.write(`\n  Room created!\n`);
    this.process.stdout.write(`  Share this code: ${room.code}\n\n`);
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
