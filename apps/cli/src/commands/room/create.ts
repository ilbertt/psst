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
    const { data, error } = await this.api('/rooms', { method: 'POST', body: {} });

    if (error) {
      this.process.stderr.write(`Failed to create room: ${formatEdenError(error)}\n`);
      return;
    }

    this.config.setCurrentRoom(data.code);
    this.process.stdout.write(`\n  Room created!\n`);
    this.process.stdout.write(`  Share this code: ${data.code}\n\n`);
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
