import {
  ASCIIFontRenderable,
  BoxRenderable,
  type CliRenderer,
  createCliRenderer,
  TextRenderable,
} from '@opentui/core';
import type { CallStats } from '#services/call.ts';
import type { Peer } from '#types.ts';

const COLORS = {
  bg: '#0f0f1a',
  speaking: '#fbbf24',
  idle: '#374151',
  label: '#e5e7eb',
  dim: '#6b7280',
  hint: '#374151',
};

const SPEAKING_THRESHOLD = 0.2;
const ANIMATION_INTERVAL_MS = 80;
const TIMER_INTERVAL_MS = 1000;

const FACE_TOP = '╭───╮';
const FACE_EYES = '│● ●│';
const FACE_BOTTOM = '╰───╯';

const MOUTHS = ['│ ─ │', '│ o │', '│ O │', '│ ◯ │'];

function levelToMouth(level: number): string {
  if (level < SPEAKING_THRESHOLD) {
    return MOUTHS[0]!;
  }
  if (level < 0.6) {
    return MOUTHS[1]!;
  }
  if (level < 0.85) {
    return MOUTHS[2]!;
  }
  return MOUTHS[3]!;
}

interface PersonHandles {
  setLevel: (level: number) => void;
}

function buildPerson(opts: { renderer: CliRenderer; name: string; idPrefix: string }): {
  box: BoxRenderable;
  handles: PersonHandles;
} {
  const box = new BoxRenderable(opts.renderer, {
    id: `${opts.idPrefix}-person`,
    flexDirection: 'column',
    alignItems: 'center',
    marginX: 4,
  });

  const faceLines = [FACE_TOP, FACE_EYES, MOUTHS[0]!, FACE_BOTTOM];
  const lines: TextRenderable[] = [];
  let lineIdx = 0;
  for (const content of faceLines) {
    const line = new TextRenderable(opts.renderer, {
      id: `${opts.idPrefix}-face-${lineIdx}`,
      content,
      fg: COLORS.idle,
      width: 5,
      height: 1,
    });
    lines.push(line);
    box.add(line);
    lineIdx++;
  }

  box.add(
    new TextRenderable(opts.renderer, {
      id: `${opts.idPrefix}-name`,
      content: opts.name,
      fg: COLORS.label,
      marginTop: 1,
    }),
  );

  const mouthLine = lines[2]!;
  let lastMouth = MOUTHS[0]!;
  let lastColor = COLORS.idle;

  return {
    box,
    handles: {
      setLevel(level: number) {
        const mouth = levelToMouth(level);
        const color = level >= SPEAKING_THRESHOLD ? COLORS.speaking : COLORS.idle;
        if (mouth !== lastMouth) {
          mouthLine.content = mouth;
          lastMouth = mouth;
        }
        if (color !== lastColor) {
          for (const line of lines) {
            line.fg = color;
          }
          lastColor = color;
        }
      },
    },
  };
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
  renderer.setBackgroundColor(COLORS.bg);

  const page = new BoxRenderable(renderer, {
    id: 'page',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  });
  renderer.root.add(page);

  page.add(
    new ASCIIFontRenderable(renderer, {
      id: 'title',
      text: 'psst',
      font: 'tiny',
      color: '#7dd3fc',
      selectable: false,
      marginBottom: 2,
    }),
  );

  const peopleRow = new BoxRenderable(renderer, {
    id: 'people',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  });
  page.add(peopleRow);

  const me = buildPerson({ renderer, name: 'You', idPrefix: 'me' });
  const them = buildPerson({ renderer, name: peer.name, idPrefix: 'them' });
  peopleRow.add(me.box);
  peopleRow.add(them.box);

  const timerText = new TextRenderable(renderer, {
    id: 'timer',
    content: '00:00',
    fg: COLORS.dim,
    marginTop: 2,
  });
  page.add(timerText);

  const statusText = new TextRenderable(renderer, {
    id: 'status',
    content: 'connecting',
    fg: COLORS.hint,
    marginTop: 1,
  });
  page.add(statusText);

  const statusLabel = (state: string): string => {
    if (state === 'connected') {
      return 'connected';
    }
    if (state === 'failed') {
      return 'call failed';
    }
    if (state === 'closed' || state === 'disconnected') {
      return state;
    }
    return 'connecting';
  };
  const isPending = (state: string): boolean => state === 'new' || state === 'connecting';

  page.add(
    new TextRenderable(renderer, {
      id: 'hint',
      content: 'Ctrl+C to hang up',
      fg: COLORS.hint,
      marginTop: 2,
    }),
  );

  const startTime = Date.now();

  const animInterval = setInterval(() => {
    me.handles.setLevel(stats.localLevel);
    them.handles.setLevel(stats.remoteLevel);
    const label = statusLabel(stats.connectionState);
    const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
    statusText.content = isPending(stats.connectionState) ? `${label}${dots}` : label;
    renderer.requestRender();
  }, ANIMATION_INTERVAL_MS);

  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    timerText.content = `${mins}:${secs}`;
    renderer.requestRender();
  }, TIMER_INTERVAL_MS);

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
