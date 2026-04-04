import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';

export const createRoom = buildCommand({
  docs: {
    brief: 'Create a new room and get a share code',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    const { data: room, error: createError } = await this.api('/rooms', {
      method: 'POST',
      body: {},
    });

    if (createError) {
      this.process.stderr.write(`Failed to create room: ${formatEdenError(createError)}\n`);
      return;
    }

    const displayName = this.config.name;
    const { data: joined, error: joinError } = await this.api('/rooms/:code/join', {
      method: 'POST',
      params: { code: room.code },
      body: { name: displayName },
    });

    if (joinError) {
      this.process.stderr.write(`Failed to join room: ${formatEdenError(joinError)}\n`);
      return;
    }

    this.config.setCurrentRoom({ code: room.code, peerId: joined.peerId });
    this.process.stdout.write(`\n  Room created!\n`);
    this.process.stdout.write(`  Share this code: ${room.code}\n\n`);
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
