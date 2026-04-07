import { createSocket } from 'node:dgram';

const PORT_POLL_INTERVAL_MS = 50;

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const PLAYBACK_PT = 111;

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

function waitForUdpPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const probe = createSocket('udp4');
      probe.once('error', () => {
        probe.close();
        resolve();
      });
      probe.bind(port, '127.0.0.1', () => {
        probe.close();
        setTimeout(check, PORT_POLL_INTERVAL_MS);
      });
    };
    check();
  });
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

export async function startPlayback(): Promise<AudioPlayback> {
  const playbackPort = 10000 + Math.floor(Math.random() * 50000);

  const sdp = [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=psst',
    `c=IN IP4 127.0.0.1`,
    't=0 0',
    `m=audio ${playbackPort} RTP/AVP ${PLAYBACK_PT}`,
    `a=rtpmap:${PLAYBACK_PT} opus/48000/2`,
  ].join('\r\n');

  const sdpPath = `/tmp/psst-playback-${playbackPort}.sdp`;
  await Bun.write(sdpPath, sdp);

  const proc = Bun.spawn(
    [
      'ffmpeg',
      '-hide_banner',
      '-loglevel',
      'error',
      '-protocol_whitelist',
      'file,udp,rtp',
      '-i',
      sdpPath,
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      ...getSpeakerOutput(),
    ],
    {
      stdout: 'ignore',
      stderr: 'ignore',
    },
  );

  await waitForUdpPort(playbackPort);

  const socket = createSocket('udp4');

  return {
    write: (data: Uint8Array) => {
      const buf = Buffer.from(data);
      // Rewrite RTP payload type to match playback SDP
      buf[1] = (buf[1]! & 0x80) | PLAYBACK_PT;
      socket.send(buf, playbackPort, '127.0.0.1');
    },
    stop: () => {
      socket.close();
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
