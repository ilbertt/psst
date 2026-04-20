import {
  ASCIIFontRenderable,
  BoxRenderable,
  type CliRenderer,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from '@opentui/core';
import type { AppContext } from '#context.ts';
import {
  createRoom,
  getPeerName,
  joinRoomByCode,
  waitForCall,
  waitForPeer,
} from '#services/room.ts';
import type { Peer } from '#types.ts';

const COLORS = {
  bg: '#0f0f1a',
  primary: '#7dd3fc',
  accent: '#fbbf24',
  text: '#ffffff',
  dim: '#6b7280',
  hint: '#4b5563',
  error: '#f87171',
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;
const ROOM_CODE_LENGTH = 4;

export type LauncherResult =
  | { kind: 'create'; myPeerId: string; roomCode: string; peer: Peer }
  | { kind: 'join'; myPeerId: string; roomCode: string; peer: Peer; offer: unknown };

export async function runLauncher(ctx: AppContext): Promise<LauncherResult | null> {
  while (true) {
    const action = await chooseAction();
    if (action === 'exit') {
      return null;
    }

    if (ctx.config.needsName) {
      const name = await promptName();
      if (!name) {
        continue;
      }
      ctx.config.update({ name });
    }

    const result = action === 'create' ? await runCreateFlow(ctx) : await runJoinFlow(ctx);
    if (result === 'back') {
      continue;
    }
    if (result) {
      return result;
    }
  }
}

async function runCreateFlow(ctx: AppContext): Promise<LauncherResult | null> {
  const joined = await createRoom({ api: ctx.api, name: ctx.config.name });
  const peer = await showWaitingForPeer({
    code: joined.code,
    api: ctx.api,
    myPeerId: joined.peerId,
  });
  if (!peer) {
    return null;
  }
  return { kind: 'create', myPeerId: joined.peerId, roomCode: joined.code, peer };
}

async function runJoinFlow(ctx: AppContext): Promise<LauncherResult | 'back' | null> {
  const code = await promptCode();
  if (code === null) {
    return 'back';
  }

  let joined: Awaited<ReturnType<typeof joinRoomByCode>>;
  try {
    joined = await joinRoomByCode({ api: ctx.api, code, name: ctx.config.name });
  } catch (err) {
    await showError((err as Error).message);
    return 'back';
  }

  const incoming = await showWaitingForCall({
    code: joined.code,
    api: ctx.api,
    myPeerId: joined.peerId,
  });
  if (!incoming) {
    return null;
  }

  const callerName = await getPeerName({
    api: ctx.api,
    roomCode: joined.code,
    myPeerId: joined.peerId,
    peerId: incoming.from,
  });
  return {
    kind: 'join',
    myPeerId: joined.peerId,
    roomCode: joined.code,
    peer: { id: incoming.from, name: callerName },
    offer: incoming.offer,
  };
}

async function openRenderer(opts?: { useMouse?: boolean }): Promise<CliRenderer> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    screenMode: 'alternate-screen',
    useMouse: opts?.useMouse ?? true,
  });
  renderer.setBackgroundColor(COLORS.bg);
  renderer.start();
  return renderer;
}

function buildHeader(opts: { renderer: CliRenderer; subtitle?: string }): BoxRenderable {
  const header = new BoxRenderable(opts.renderer, {
    id: 'header',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 2,
  });

  header.add(
    new ASCIIFontRenderable(opts.renderer, {
      id: 'title',
      text: 'psst',
      font: 'tiny',
      color: COLORS.primary,
      selectable: false,
    }),
  );

  if (opts.subtitle) {
    header.add(
      new TextRenderable(opts.renderer, {
        id: 'subtitle',
        content: opts.subtitle,
        fg: COLORS.dim,
        marginTop: 1,
      }),
    );
  }

  return header;
}

function buildPage(renderer: CliRenderer): BoxRenderable {
  const page = new BoxRenderable(renderer, {
    id: 'page',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  });
  renderer.root.add(page);
  return page;
}

async function promptName(): Promise<string | null> {
  const renderer = await openRenderer();
  try {
    const page = buildPage(renderer);
    page.add(buildHeader({ renderer, subtitle: 'tap someone on the shoulder' }));

    page.add(
      new TextRenderable(renderer, {
        id: 'q',
        content: "What's your name?",
        fg: COLORS.text,
        marginBottom: 1,
      }),
    );

    const input = new InputRenderable(renderer, {
      id: 'name',
      width: 28,
      placeholder: 'Your name',
      backgroundColor: '#1f2937',
      textColor: COLORS.text,
      focusedBackgroundColor: '#1f2937',
      focusedTextColor: COLORS.text,
      placeholderColor: COLORS.dim,
      cursorColor: COLORS.accent,
      maxLength: 32,
    });
    page.add(input);

    page.add(
      new TextRenderable(renderer, {
        id: 'hint',
        content: 'Enter to confirm  ·  Esc to go back',
        fg: COLORS.hint,
        marginTop: 2,
      }),
    );

    input.focus();

    return await new Promise<string | null>((resolve) => {
      input.on(InputRenderableEvents.ENTER, (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          resolve(trimmed);
        }
      });
      renderer.keyInput.on('keypress', (key) => {
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          resolve(null);
        }
      });
    });
  } finally {
    renderer.destroy();
  }
}

type Action = 'create' | 'join' | 'exit';

async function chooseAction(): Promise<Action> {
  const renderer = await openRenderer();
  try {
    const page = buildPage(renderer);
    page.add(buildHeader({ renderer, subtitle: 'tap someone on the shoulder' }));

    const select = new SelectRenderable(renderer, {
      id: 'menu',
      width: 36,
      height: 6,
      options: [
        { name: 'Create a new room', description: '', value: 'create' },
        { name: 'Join a room', description: '', value: 'join' },
      ],
      backgroundColor: COLORS.bg,
      textColor: COLORS.text,
      focusedBackgroundColor: COLORS.bg,
      focusedTextColor: COLORS.text,
      selectedBackgroundColor: COLORS.primary,
      selectedTextColor: COLORS.bg,
      showDescription: false,
      itemSpacing: 1,
    });
    page.add(select);

    page.add(
      new TextRenderable(renderer, {
        id: 'hint',
        content: '↑ ↓ to move  ·  Enter to choose  ·  Ctrl+C to quit',
        fg: COLORS.hint,
        marginTop: 2,
      }),
    );

    select.focus();

    return await new Promise<Action>((resolve) => {
      select.on(SelectRenderableEvents.ITEM_SELECTED, () => {
        const option = select.getSelectedOption();
        resolve((option?.value as Action) ?? 'exit');
      });
      renderer.keyInput.on('keypress', (key) => {
        if (key.ctrl && key.name === 'c') {
          resolve('exit');
        }
      });
    });
  } finally {
    renderer.destroy();
  }
}

async function promptCode(): Promise<string | null> {
  const renderer = await openRenderer();
  try {
    const page = buildPage(renderer);
    page.add(buildHeader({ renderer }));

    page.add(
      new TextRenderable(renderer, {
        id: 'q',
        content: 'Enter room code:',
        fg: COLORS.text,
        marginBottom: 1,
      }),
    );

    const input = new InputRenderable(renderer, {
      id: 'code',
      width: ROOM_CODE_LENGTH + 2,
      placeholder: 'ABCD',
      backgroundColor: '#1f2937',
      textColor: COLORS.accent,
      focusedBackgroundColor: '#1f2937',
      focusedTextColor: COLORS.accent,
      placeholderColor: COLORS.dim,
      cursorColor: COLORS.accent,
      maxLength: ROOM_CODE_LENGTH,
    });
    page.add(input);

    page.add(
      new TextRenderable(renderer, {
        id: 'hint',
        content: 'Enter to join  ·  Esc to go back',
        fg: COLORS.hint,
        marginTop: 2,
      }),
    );

    input.focus();

    return await new Promise<string | null>((resolve) => {
      input.on(InputRenderableEvents.ENTER, (value: string) => {
        const code = value.trim().toUpperCase();
        if (code.length === ROOM_CODE_LENGTH) {
          resolve(code);
        }
      });
      renderer.keyInput.on('keypress', (key) => {
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          resolve(null);
        }
      });
    });
  } finally {
    renderer.destroy();
  }
}

async function showWaitingForPeer(opts: {
  code: string;
  api: AppContext['api'];
  myPeerId: string;
}): Promise<Peer | null> {
  const renderer = await openRenderer({ useMouse: false });
  try {
    const page = buildPage(renderer);
    page.add(buildHeader({ renderer }));

    page.add(
      new TextRenderable(renderer, {
        id: 'label',
        content: 'Share this room code:',
        fg: COLORS.dim,
        marginBottom: 1,
      }),
    );

    page.add(
      new TextRenderable(renderer, {
        id: 'code',
        content: opts.code,
        fg: COLORS.accent,
        attributes: 1,
        selectable: true,
      }),
    );

    const status = new TextRenderable(renderer, {
      id: 'status',
      content: `${SPINNER_FRAMES[0]} Waiting for someone...`,
      fg: COLORS.text,
      marginTop: 2,
    });
    page.add(status);

    page.add(
      new TextRenderable(renderer, {
        id: 'cancel',
        content: 'Esc to cancel',
        fg: COLORS.hint,
        marginTop: 2,
      }),
    );

    let frame = 0;
    const spinner = setInterval(() => {
      frame = (frame + 1) % SPINNER_FRAMES.length;
      status.content = `${SPINNER_FRAMES[frame]} Waiting for someone...`;
      renderer.requestRender();
    }, SPINNER_INTERVAL_MS);

    const controller = new AbortController();

    return await new Promise<Peer | null>((resolve) => {
      renderer.keyInput.on('keypress', (key) => {
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          controller.abort();
          resolve(null);
        }
      });

      waitForPeer({
        api: opts.api,
        roomCode: opts.code,
        myPeerId: opts.myPeerId,
        signal: controller.signal,
      }).then(resolve);
    }).finally(() => {
      clearInterval(spinner);
    });
  } finally {
    renderer.destroy();
  }
}

async function showWaitingForCall(opts: {
  code: string;
  api: AppContext['api'];
  myPeerId: string;
}): Promise<{ from: string; offer: unknown } | null> {
  const renderer = await openRenderer();
  try {
    const page = buildPage(renderer);
    page.add(buildHeader({ renderer }));

    page.add(
      new TextRenderable(renderer, {
        id: 'label',
        content: `Joined room ${opts.code}`,
        fg: COLORS.dim,
        marginBottom: 2,
      }),
    );

    const status = new TextRenderable(renderer, {
      id: 'status',
      content: `${SPINNER_FRAMES[0]} Waiting for the call...`,
      fg: COLORS.text,
    });
    page.add(status);

    page.add(
      new TextRenderable(renderer, {
        id: 'hint',
        content: 'Esc to cancel',
        fg: COLORS.hint,
        marginTop: 2,
      }),
    );

    let frame = 0;
    const spinner = setInterval(() => {
      frame = (frame + 1) % SPINNER_FRAMES.length;
      status.content = `${SPINNER_FRAMES[frame]} Waiting for the call...`;
      renderer.requestRender();
    }, SPINNER_INTERVAL_MS);

    const controller = new AbortController();

    return await new Promise<{ from: string; offer: unknown } | null>((resolve) => {
      renderer.keyInput.on('keypress', (key) => {
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          controller.abort();
          resolve(null);
        }
      });

      waitForCall({
        api: opts.api,
        roomCode: opts.code,
        myPeerId: opts.myPeerId,
        signal: controller.signal,
      }).then(resolve);
    }).finally(() => {
      clearInterval(spinner);
    });
  } finally {
    renderer.destroy();
  }
}

async function showError(message: string): Promise<void> {
  const renderer = await openRenderer();
  try {
    const page = buildPage(renderer);
    page.add(buildHeader({ renderer }));

    page.add(
      new TextRenderable(renderer, {
        id: 'msg',
        content: message,
        fg: COLORS.error,
        marginBottom: 2,
      }),
    );

    page.add(
      new TextRenderable(renderer, {
        id: 'hint',
        content: 'Press any key to continue',
        fg: COLORS.hint,
      }),
    );

    return await new Promise<void>((resolve) => {
      renderer.keyInput.on('keypress', () => resolve());
    });
  } finally {
    renderer.destroy();
  }
}
