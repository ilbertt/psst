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
  const proc = Bun.spawn(
    [
      'ffmpeg',
      '-y',
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'info',
      // Don't let the demuxer accumulate input before encoding starts.
      '-fflags',
      'nobuffer',
      ...getMicInput(),
      '-map',
      '0:a',
      '-acodec',
      'libopus',
      '-application',
      'voip',
      // Smallest standard Opus frame keeps packetization delay low (10 ms vs
      // the 20 ms default) while staying within VoIP-friendly settings.
      '-frame_duration',
      '10',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-payload_type',
      String(PLAYBACK_PT),
      // Emit each RTP packet the instant it's encoded instead of buffering.
      '-flush_packets',
      '1',
      '-f',
      'rtp',
      `rtp://127.0.0.1:${port}`,
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
      'ffplay',
      '-nodisp',
      '-autoexit',
      '-hide_banner',
      '-loglevel',
      'info',
      '-fflags',
      'nobuffer',
      '-flags',
      'low_delay',
      // The codec is already known from the SDP, so skip stream probing/analysis
      // that would otherwise delay first audio.
      '-probesize',
      '32',
      '-analyzeduration',
      '0',
      // Don't hold packets to reorder — on a LAN jitter is negligible, and any
      // reorder/jitter buffer is added mouth-to-ear latency.
      '-max_delay',
      '0',
      '-reorder_queue_size',
      '0',
      '-protocol_whitelist',
      'file,udp,rtp',
      '-i',
      sdpPath,
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
