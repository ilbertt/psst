import type { FileSink } from 'bun';

const SAMPLE_RATE = 48000;
const CHANNELS = 1;

export interface AudioCapture {
  stream: ReadableStream<Uint8Array>;
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

export function startCapture(): AudioCapture {
  const proc = Bun.spawn(
    [
      'ffmpeg',
      '-hide_banner',
      '-loglevel',
      'error',
      ...getMicInput(),
      '-f',
      's16le',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      'pipe:1',
    ],
    {
      stdout: 'pipe',
      stderr: 'ignore',
    },
  );

  return {
    stream: proc.stdout as ReadableStream<Uint8Array>,
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
      's16le',
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
