import { defineRootCommand } from '@parshjs/core';
import { checkFfmpeg } from '#services/audio.ts';
import { type ActiveCall, answerCall, startCall } from '#services/call.ts';
import { runLauncher } from '#ui/launcher.tsx';
import { showTalkingScreen } from '#ui/talking-screen.tsx';

function ffmpegInstallHint(): string {
  if (process.platform === 'darwin') {
    return 'brew install ffmpeg';
  }
  if (process.platform === 'linux') {
    return 'sudo apt install ffmpeg  (or your distro equivalent)';
  }
  return 'winget install ffmpeg  (or see https://ffmpeg.org/download.html)';
}

export const command = defineRootCommand({
  options: {},
  handler: async ({ context, print }) => {
    if (!(await checkFfmpeg())) {
      print.error(
        `ffmpeg is not installed. psst needs it for audio capture and playback.\n` +
          `Install it with: ${ffmpegInstallHint()}`,
      );
      process.exit(1);
    }

    const result = await runLauncher(context);
    if (!result) {
      return;
    }

    let call: ActiveCall;
    if (result.kind === 'create') {
      call = await startCall({
        api: context.api,
        roomCode: result.roomCode,
        myPeerId: result.myPeerId,
        peer: result.peer,
      });
    } else {
      call = await answerCall({
        api: context.api,
        roomCode: result.roomCode,
        myPeerId: result.myPeerId,
        peer: result.peer,
        offer: result.offer,
      });
    }

    await showTalkingScreen({ peer: call.peer, stats: call.stats });
    call.stop();
  },
});
