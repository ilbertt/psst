import { createSocket } from 'node:dgram';
import { openSync } from 'node:fs';

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

  const logPath = `/tmp/psst-capture-${process.pid}.log`;
  const wavPath = `/tmp/psst-mic-${process.pid}.wav`;
  const proc = Bun.spawn(
    [
      'ffmpeg',
      '-y',
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'info',
      ...getMicInput(),
      '-map',
      '0:a',
      '-acodec',
      'libopus',
      '-application',
      'voip',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-payload_type',
      String(PLAYBACK_PT),
      '-f',
      'rtp',
      `rtp://127.0.0.1:${port}`,
      '-map',
      '0:a',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-f',
      'wav',
      wavPath,
    ],
    {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: openSync(logPath, 'a'),
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
    `a=fmtp:${PLAYBACK_PT} sprop-stereo=0;stereo=0;useinbandfec=1`,
  ].join('\r\n');

  const sdpPath = `/tmp/psst-playback-${playbackPort}.sdp`;
  await Bun.write(sdpPath, sdp);

  const logPath = `/tmp/psst-playback-${process.pid}.log`;

  const proc = Bun.spawn(
    [
      'ffmpeg',
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'info',
      '-fflags',
      '+nobuffer+discardcorrupt',
      '-flags',
      'low_delay',
      '-reorder_queue_size',
      '0',
      '-max_delay',
      '0',
      '-analyzeduration',
      '0',
      '-probesize',
      '32',
      '-protocol_whitelist',
      'file,udp,rtp',
      '-i',
      sdpPath,
      '-f',
      'audiotoolbox',
      '-',
    ],
    {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: openSync(logPath, 'a'),
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
