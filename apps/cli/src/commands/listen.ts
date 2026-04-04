import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { checkFfmpeg } from '#services/audio.ts';
import { answerCall } from '#services/call.ts';
import { showTalkingScreen } from '#ui/talking-screen.ts';

const HTTP_STATUS_REQUEST_TIMEOUT = 408;

export const listen = buildCommand({
  docs: {
    brief: 'Listen for incoming calls',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    const room = this.config.getCurrentRoom();
    if (!room) {
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

    this.process.stdout.write(`\n  Listening as ${this.config.name} in room ${room.code}...\n`);
    this.process.stdout.write('  Waiting for incoming calls. Ctrl+C to stop.\n\n');

    let stopped = false;
    process.once('SIGINT', () => {
      stopped = true;
    });

    while (!stopped) {
      try {
        const { data, error } = await this.api('/rooms/:code/calls/poll', {
          params: { code: room.code },
          headers: { 'psst-peer-id': room.peerId },
          signal: AbortSignal.timeout(35_000),
        });

        if (error) {
          if (error.status === HTTP_STATUS_REQUEST_TIMEOUT) {
            continue;
          }
          break;
        }

        this.process.stdout.write(`\n  Incoming call from ${data.from}!\n`);

        const call = await answerCall({
          api: this.api,
          roomCode: room.code,
          myPeerId: room.peerId,
          callerPeerId: data.from,
          offer: data.offer,
        });

        await showTalkingScreen(call.peer);
        call.stop();

        this.process.stdout.write('\n  Call ended. Listening again...\n\n');
      } catch {
        if (stopped) {
          break;
        }
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
