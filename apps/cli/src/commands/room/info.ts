import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';

export const roomInfo = buildCommand({
  docs: {
    brief: 'Show current room info',
  },
  parameters: { flags: {} },
  async func(this: AppContext, _flags) {
    const roomCode = this.config.getCurrentRoom();
    if (!roomCode) {
      this.process.stderr.write("Not in a room. Run 'psst room join <code>' first.\n");
      return;
    }

    const members = await this.api.getRoomMembers(roomCode);

    this.process.stdout.write(`\n  Room: ${roomCode}\n`);
    this.process.stdout.write(`  Members (${members.length}):\n`);
    for (const member of members) {
      this.process.stdout.write(`    - ${member.name}\n`);
    }
    this.process.stdout.write('\n');
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
