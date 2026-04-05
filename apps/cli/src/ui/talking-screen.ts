import { BoxRenderable, createCliRenderer, TextRenderable } from '@opentui/core';
import type { Peer } from '#types.ts';

const WAVE_FRAMES = [
  '  ·  )))        ((( ·  ',
  '  · ))))       (((( ·  ',
  '  ·  )))        ((( ·  ',
  '  ·   ))         (( ·  ',
  '  ·    )          ( ·  ',
  '  ·   ))         (( ·  ',
];

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
    content: WAVE_FRAMES[0],
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
    frameIndex = (frameIndex + 1) % WAVE_FRAMES.length;
    waveText.content = WAVE_FRAMES[frameIndex]!;
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
