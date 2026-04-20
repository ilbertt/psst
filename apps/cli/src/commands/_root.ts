import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { checkFfmpeg } from '#services/audio.ts';
import { type ActiveCall, answerCall, startCall } from '#services/call.ts';
import { runLauncher } from '#ui/launcher.ts';
import { showTalkingScreen } from '#ui/talking-screen.ts';

function ffmpegInstallHint(): string {
  if (process.platform === 'darwin') {
    return 'brew install ffmpeg';
  }
  if (process.platform === 'linux') {
    return 'sudo apt install ffmpeg  (or your distro equivalent)';
  }
  return 'winget install ffmpeg  (or see https://ffmpeg.org/download.html)';
}

export const rootCommand = buildCommand({
  docs: {
    brief: 'psst — tap someone on the shoulder',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    if (!(await checkFfmpeg())) {
      process.stderr.write(
        `ffmpeg is not installed. psst needs it for audio capture and playback.\n` +
          `Install it with: ${ffmpegInstallHint()}\n`,
      );
      process.exit(1);
    }

    const result = await runLauncher(this);
    if (!result) {
      return;
    }

    let call: ActiveCall;
    if (result.kind === 'create') {
      call = await startCall({
        api: this.api,
        roomCode: result.roomCode,
        myPeerId: result.myPeerId,
        peer: result.peer,
      });
    } else {
      call = await answerCall({
        api: this.api,
        roomCode: result.roomCode,
        myPeerId: result.myPeerId,
        peer: result.peer,
        offer: result.offer,
      });
    }

    await showTalkingScreen({ peer: call.peer, stats: call.stats });
    call.stop();
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
