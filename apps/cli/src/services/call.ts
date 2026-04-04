import type { Peer } from '#types.ts';
import { type AudioCapture, type AudioPlayback, startCapture, startPlayback } from './audio.ts';

async function pipeAudio({
  capture,
  playback,
}: {
  capture: AudioCapture;
  playback: AudioPlayback;
}) {
  const reader = capture.stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      playback.write(value);
    }
  } catch {
    // stream closed
  }
}

export interface ActiveCall {
  peer: Peer;
  startedAt: Date;
  stop: () => void;
}

export async function startCall(peer: Peer): Promise<ActiveCall> {
  const capture = startCapture();
  const playback = startPlayback();

  // TODO: Replace with real WebRTC via werift
  // For now, pipe mic → speaker (loopback for testing)
  pipeAudio({ capture, playback });

  return {
    peer,
    startedAt: new Date(),
    stop: () => {
      capture.stop();
      playback.stop();
    },
  };
}
