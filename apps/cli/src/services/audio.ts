import { createSocket } from 'node:dgram';
import type { FileSink } from 'bun';

const SAMPLE_RATE = 48000;
const CHANNELS = 1;

export interface AudioCapture {
  port: number;
  stop: () => void;
}

export interface AudioPlayback {
  write: (data: Uint8Array) => void;
  stop: () => void;
}

function getMicInput(): string[] {
  if (process.platform === 'darwin') {
    return ['-f', 'avfoundation', '-i', 'none:default'];
  }
  if (process.platform === 'linux') {
    return ['-f', 'alsa', '-i', 'default'];
  }
  return ['-f', 'dshow', '-i', 'audio=default'];
}

function getSpeakerOutput(): string[] {
  if (process.platform === 'darwin') {
    return ['-f', 'audiotoolbox', 'default'];
  }
  if (process.platform === 'linux') {
    return ['-f', 'alsa', 'default'];
  }
  return ['-f', 'dshow', 'default'];
}

export async function startCapture(): Promise<AudioCapture> {
  const port = 10000 + Math.floor(Math.random() * 50000);

  const proc = Bun.spawn(
    [
      'ffmpeg',
      '-hide_banner',
      '-loglevel',
      'error',
      ...getMicInput(),
      '-acodec',
      'libopus',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-f',
      'rtp',
      `rtp://127.0.0.1:${port}`,
    ],
    {
      stdout: 'ignore',
      stderr: 'ignore',
    },
  );

  return {
    port,
    stop: () => proc.kill(),
  };
}

export function startPlayback(): AudioPlayback {
  const proc = Bun.spawn(
    [
      'ffmpeg',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'opus',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-i',
      'pipe:0',
      ...getSpeakerOutput(),
    ],
    {
      stdin: 'pipe',
      stdout: 'ignore',
      stderr: 'ignore',
    },
  );

  const sink = proc.stdin as FileSink;

  return {
    write: (data: Uint8Array) => {
      sink.write(data);
      sink.flush();
    },
    stop: () => {
      sink.end();
      proc.kill();
    },
  };
}

export function listenForRtp({
  port,
  onPacket,
}: {
  port: number;
  onPacket: (data: Buffer) => void;
}): { stop: () => void } {
  const socket = createSocket('udp4');
  socket.on('message', onPacket);
  socket.bind(port, '127.0.0.1');
  return {
    stop: () => socket.close(),
  };
}

export async function checkFfmpeg(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['ffmpeg', '-version'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}
