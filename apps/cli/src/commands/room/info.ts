import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';

export const roomInfo = buildCommand({
  docs: {
    brief: 'Show current room info',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    const roomCode = this.config.getCurrentRoom();
    if (!roomCode) {
      this.process.stderr.write("Not in a room. Run 'psst room join <code>' first.\n");
      return;
    }

    const { data, error } = await this.api('/rooms/:code/peers', {
      params: { code: roomCode },
    });

    if (error) {
      this.process.stderr.write(`Failed to get room info: ${formatEdenError(error)}\n`);
      return;
    }

    this.process.stdout.write(`\n  Room: ${roomCode}\n`);
    this.process.stdout.write(`  Members (${data.length}):\n`);
    for (const member of data) {
      this.process.stdout.write(`    - ${member.name}\n`);
    }
    this.process.stdout.write('\n');
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
