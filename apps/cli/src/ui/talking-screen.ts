import { BoxRenderable, createCliRenderer, TextRenderable } from '@opentui/core';
import type { Peer } from '#types.ts';

const BAR_CHARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const BAR_COUNT = 16;

const BAR_FRAMES = buildBarFrames({ count: 24, bars: BAR_COUNT });

function buildBarFrames({ count, bars }: { count: number; bars: number }): string[] {
  const heights = Array.from({ length: bars }, () => Math.random());
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    // biome-ignore lint/complexity/useMaxParams: Array.map callback requires index
    const cols = heights.map((h, idx) => {
      const phase = (idx / bars) * Math.PI * 2;
      const level = 0.3 + 0.7 * h * ((1 + Math.sin(t + phase)) / 2);
      return BAR_CHARS[Math.round(level * (BAR_CHARS.length - 1))]!;
    });
    frames.push(`    ${cols.join(' ')}    `);
  }
  return frames;
}

export interface CallStats {
  sent: number;
  received: number;
  connectionState: string;
}

export async function showTalkingScreen({
  peer,
  stats,
}: {
  peer: Peer;
  stats: CallStats;
}): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    screenMode: 'alternate-screen',
  });

  const container = new BoxRenderable(renderer, {
    id: 'container',
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
  });

  const waveText = new TextRenderable(renderer, {
    id: 'wave',
    content: BAR_FRAMES[0],
    width: 40,
    height: 1,
    fg: '#3b82f6',
  });

  const label = new TextRenderable(renderer, {
    id: 'label',
    content: `TALKING with ${peer.name}`,
    width: 40,
    height: 1,
    fg: '#ffffff',
  });

  const timerText = new TextRenderable(renderer, {
    id: 'timer',
    content: '00:00',
    width: 40,
    height: 1,
    fg: '#a0a0a0',
  });

  const statsText = new TextRenderable(renderer, {
    id: 'stats',
    content: '',
    width: 40,
    height: 1,
    fg: '#555555',
  });

  const hint = new TextRenderable(renderer, {
    id: 'hint',
    content: 'Ctrl+C to hang up',
    width: 40,
    height: 1,
    fg: '#666666',
  });

  container.add(waveText);
  container.add(label);
  container.add(timerText);
  container.add(statsText);
  container.add(hint);
  renderer.root.add(container);

  let frameIndex = 0;
  const startTime = Date.now();

  const animInterval = setInterval(() => {
    frameIndex = (frameIndex + 1) % BAR_FRAMES.length;
    waveText.content = BAR_FRAMES[frameIndex]!;
    renderer.requestRender();
  }, 200);

  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    timerText.content = `${mins}:${secs}`;
    statsText.content = `${stats.connectionState} | tx:${stats.sent} rx:${stats.received}`;
    renderer.requestRender();
  }, 1000);

  renderer.start();

  return new Promise<void>((resolve) => {
    renderer.keyInput.on('keypress', (key) => {
      if (key.ctrl && key.name === 'c') {
        clearInterval(animInterval);
        clearInterval(timerInterval);
        renderer.destroy();
        resolve();
      }
    });
  });
}
