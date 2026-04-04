import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { formatEdenError } from '#services/api-client.ts';
import { checkFfmpeg } from '#services/audio.ts';
import { startCall } from '#services/call.ts';
import { showPeerSelect } from '#ui/peer-select.ts';
import { showTalkingScreen } from '#ui/talking-screen.ts';

export const talk = buildCommand({
  docs: {
    brief: 'Start a voice chat with someone in your room',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    const roomCode = this.config.getCurrentRoom();
    if (!roomCode) {
      this.process.stderr.write("Not in a room. Run 'psst room join <code>' first.\n");
      return;
    }

    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      this.process.stderr.write('ffmpeg is required for audio. Install it:\n');
      this.process.stderr.write('  brew install ffmpeg     (macOS)\n');
      this.process.stderr.write('  sudo apt install ffmpeg (Linux)\n');
      return;
    }

    const { data: members, error } = await this.api('/rooms/:code/peers', {
      params: { code: roomCode },
    });

    if (error) {
      this.process.stderr.write(`Failed to get peers: ${formatEdenError(error)}\n`);
      return;
    }

    if (members.length === 0) {
      this.process.stdout.write('\n  No one else is in the room yet.\n\n');
      return;
    }

    const peer = await showPeerSelect(members);
    if (!peer) return;

    const screen = await showTalkingScreen(peer);
    const call = await startCall(peer);

    await new Promise<void>((resolve) => {
      const cleanup = () => {
        call.stop();
        screen.destroy();
        resolve();
      };

      process.once('SIGINT', cleanup);
      process.once('SIGTERM', cleanup);
    });
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
