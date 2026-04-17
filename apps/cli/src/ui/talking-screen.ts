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
  idle: '#4b5563',
  label: '#e5e7eb',
  dim: '#6b7280',
  hint: '#374151',
};

const SPEAKING_THRESHOLD = 0.12;
const ANIMATION_INTERVAL_MS = 60;
const TIMER_INTERVAL_MS = 1000;

const FACE_HAIR = '  ___  ';
const FACE_BROW = ' /   \\ ';
const FACE_EYES = '( o o )';
const FACE_CHIN = '  ───  ';

const MOUTHS = [' \\ ─ / ', ' \\ o / ', ' \\ O / '];

function levelToMouth(level: number): string {
  if (level < 0.12) {
    return MOUTHS[0]!;
  }
  if (level < 0.35) {
    return MOUTHS[1]!;
  }
  return MOUTHS[2]!;
}

interface FaceHandles {
  setLevel: (level: number) => void;
}

// biome-ignore lint/complexity/useMaxParams: builder takes renderer + face options
function buildFace(
  renderer: CliRenderer,
  { name, idPrefix }: { name: string; idPrefix: string },
): { box: BoxRenderable; handles: FaceHandles } {
  const box = new BoxRenderable(renderer, {
    id: `${idPrefix}-face`,
    flexDirection: 'column',
    alignItems: 'center',
    marginX: 4,
  });

  const faceLines = [FACE_HAIR, FACE_BROW, FACE_EYES, MOUTHS[0]!, FACE_CHIN];
  const lines: TextRenderable[] = [];
  let lineIdx = 0;
  for (const content of faceLines) {
    const line = new TextRenderable(renderer, {
      id: `${idPrefix}-line-${lineIdx}`,
      content,
      fg: COLORS.idle,
      width: 7,
      height: 1,
    });
    lines.push(line);
    box.add(line);
    lineIdx++;
  }

  box.add(
    new TextRenderable(renderer, {
      id: `${idPrefix}-name`,
      content: name,
      fg: COLORS.label,
      marginTop: 1,
    }),
  );

  const mouthLine = lines[3]!;
  let lastColor = COLORS.idle;
  let lastMouth = MOUTHS[0]!;

  return {
    box,
    handles: {
      setLevel(level: number) {
        const speaking = level >= SPEAKING_THRESHOLD;
        const color = speaking ? COLORS.speaking : COLORS.idle;
        const mouth = levelToMouth(level);
        if (color !== lastColor) {
          for (const line of lines) {
            line.fg = color;
          }
          lastColor = color;
        }
        if (mouth !== lastMouth) {
          mouthLine.content = mouth;
          lastMouth = mouth;
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

  const facesRow = new BoxRenderable(renderer, {
    id: 'faces',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  });
  page.add(facesRow);

  const me = buildFace(renderer, { name: 'You', idPrefix: 'me' });
  const them = buildFace(renderer, { name: peer.name, idPrefix: 'them' });
  facesRow.add(me.box);
  facesRow.add(them.box);

  const timerText = new TextRenderable(renderer, {
    id: 'timer',
    content: '00:00',
    fg: COLORS.dim,
    marginTop: 2,
  });
  page.add(timerText);

  const statusText = new TextRenderable(renderer, {
    id: 'status',
    content: 'connecting...',
    fg: COLORS.hint,
    marginTop: 1,
  });
  page.add(statusText);

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
    renderer.requestRender();
  }, ANIMATION_INTERVAL_MS);

  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    timerText.content = `${mins}:${secs}`;
    statusText.content = stats.connectionState;
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
