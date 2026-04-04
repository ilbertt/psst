import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { checkFfmpeg } from '#services/audio.ts';

export const listen = buildCommand({
  docs: {
    brief: 'Listen for incoming calls',
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

    const name = this.config.get('name') ?? 'Anonymous';
    this.process.stdout.write(`\n  Listening as ${name} in room ${roomCode}...\n`);
    this.process.stdout.write('  Waiting for incoming calls. Ctrl+C to stop.\n\n');

    // TODO: Long poll for incoming calls
    // When a call comes in:
    //   1. Show notification
    //   2. Start WebRTC connection
    //   3. Show talking screen
    await new Promise<void>((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
