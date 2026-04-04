import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';

export const talk = buildCommand({
  docs: {
    brief: 'Start a voice chat with someone in your room',
  },
  parameters: { flags: {} },
  async func(this: AppContext, _flags) {
    const roomCode = this.config.getCurrentRoom();
    if (!roomCode) {
      this.process.stderr.write("Not in a room. Run 'psst room join <code>' first.\n");
      return;
    }

    const members = await this.api.getRoomMembers(roomCode);
    if (members.length === 0) {
      this.process.stdout.write('\n  No one else is in the room yet.\n\n');
      return;
    }

    // TODO: OpenTUI peer select + WebRTC call
    this.process.stdout.write('\n  Available peers:\n');
    for (const member of members) {
      this.process.stdout.write(`    - ${member.name}\n`);
    }
    this.process.stdout.write('\n  (Peer selection UI coming soon...)\n\n');
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
