import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { checkFfmpeg } from '#services/audio.ts';
import { startCall } from '#services/call.ts';
import { waitForPeers } from '#services/peer-poller.ts';
import { showPeerSelect } from '#ui/peer-select.ts';
import { showTalkingScreen } from '#ui/talking-screen.ts';

export const talk = buildCommand({
  docs: {
    brief: 'Start a voice chat with someone in your room',
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

    this.process.stdout.write('\n  Waiting for peers...\n');

    const abort = new AbortController();
    const onCancel = () => abort.abort();
    process.once('SIGINT', onCancel);

    const members = await waitForPeers({
      api: this.api,
      roomCode: room.code,
      peerId: room.peerId,
      signal: abort.signal,
    });

    process.removeListener('SIGINT', onCancel);
    if (members.length === 0) {
      return;
    }

    const peer = await showPeerSelect(members);
    if (!peer) {
      return;
    }

    this.process.stdout.write(`\n  Calling ${peer.name}...\n`);

    const call = await startCall({
      api: this.api,
      roomCode: room.code,
      myPeerId: room.peerId,
      peer,
    });

    await showTalkingScreen(peer);
    call.stop();
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
