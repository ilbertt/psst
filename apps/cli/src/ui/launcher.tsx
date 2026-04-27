import { Box, render, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { AppContext } from '#context.ts';
import { DEFAULT_CONFIG } from '#files.ts';
import {
  createRoom,
  getPeerName,
  joinRoomByCode,
  waitForCall,
  waitForPeer,
} from '#services/room.ts';
import type { Peer } from '#types.ts';
import { COLORS, Header, Page, Select, Spinner, TextInput } from './components.tsx';

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

    if (ctx.config.value.name === DEFAULT_CONFIG.name) {
      const name = await promptName();
      if (!name) {
        continue;
      }
      await ctx.config.set({ name });
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
  const joined = await createRoom({ api: ctx.api, name: ctx.config.value.name });
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
    joined = await joinRoomByCode({ api: ctx.api, code, name: ctx.config.value.name });
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

async function runScreen<T>(node: (resolve: (value: T) => void) => React.ReactElement): Promise<T> {
  return await new Promise<T>((resolve) => {
    const instance = render(
      node((value) => {
        instance.unmount();
        resolve(value);
      }),
      { exitOnCtrlC: false },
    );
  });
}

type Action = 'create' | 'join' | 'exit';

async function chooseAction(): Promise<Action> {
  return await runScreen<Action>((resolve) => <MenuScreen onDone={resolve} />);
}

function MenuScreen({ onDone }: { onDone: (action: Action) => void }) {
  // biome-ignore lint/complexity/useMaxParams: ink useInput signature
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onDone('exit');
    }
  });

  return (
    <Page>
      <Header subtitle="tap someone on the shoulder" />
      <Select
        options={[
          { label: 'Create a new room', value: 'create' },
          { label: 'Join a room', value: 'join' },
        ]}
        onSelect={(value) => onDone(value as Action)}
        onCancel={() => onDone('exit')}
      />
      <Box marginTop={2}>
        <Text color={COLORS.hint}>↑ ↓ to move · Enter to choose · Ctrl+C to quit</Text>
      </Box>
    </Page>
  );
}

async function promptName(): Promise<string | null> {
  return await runScreen<string | null>((resolve) => <NameScreen onDone={resolve} />);
}

function NameScreen({ onDone }: { onDone: (name: string | null) => void }) {
  const [value, setValue] = useState('');

  // biome-ignore lint/complexity/useMaxParams: ink useInput signature
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onDone(null);
    }
  });

  return (
    <Page>
      <Header subtitle="tap someone on the shoulder" />
      <Box marginBottom={1}>
        <Text color={COLORS.text}>What's your name?</Text>
      </Box>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(v) => {
          const trimmed = v.trim();
          if (trimmed.length > 0) {
            onDone(trimmed);
          }
        }}
        onCancel={() => onDone(null)}
        placeholder="Your name"
        maxLength={32}
      />
      <Box marginTop={2}>
        <Text color={COLORS.hint}>Enter to confirm · Esc to go back</Text>
      </Box>
    </Page>
  );
}

async function promptCode(): Promise<string | null> {
  return await runScreen<string | null>((resolve) => <CodeScreen onDone={resolve} />);
}

function CodeScreen({ onDone }: { onDone: (code: string | null) => void }) {
  const [value, setValue] = useState('');

  // biome-ignore lint/complexity/useMaxParams: ink useInput signature
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onDone(null);
    }
  });

  return (
    <Page>
      <Header />
      <Box marginBottom={1}>
        <Text color={COLORS.text}>Enter room code:</Text>
      </Box>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(v) => {
          const code = v.trim().toUpperCase();
          if (code.length === ROOM_CODE_LENGTH) {
            onDone(code);
          }
        }}
        onCancel={() => onDone(null)}
        placeholder="ABCD"
        maxLength={ROOM_CODE_LENGTH}
        uppercase
        color={COLORS.accent}
      />
      <Box marginTop={2}>
        <Text color={COLORS.hint}>Enter to join · Esc to go back</Text>
      </Box>
    </Page>
  );
}

async function showWaitingForPeer(opts: {
  code: string;
  api: AppContext['api'];
  myPeerId: string;
}): Promise<Peer | null> {
  return await runScreen<Peer | null>((resolve) => (
    <WaitingForPeerScreen
      code={opts.code}
      api={opts.api}
      myPeerId={opts.myPeerId}
      onDone={resolve}
    />
  ));
}

function WaitingForPeerScreen({
  code,
  api,
  myPeerId,
  onDone,
}: {
  code: string;
  api: AppContext['api'];
  myPeerId: string;
  onDone: (peer: Peer | null) => void;
}) {
  const [controller] = useState(() => new AbortController());

  // biome-ignore lint/complexity/useMaxParams: ink useInput signature
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      controller.abort();
      onDone(null);
    }
  });

  useStartupEffect(() => {
    waitForPeer({ api, roomCode: code, myPeerId, signal: controller.signal }).then((peer) => {
      if (!controller.signal.aborted) {
        onDone(peer);
      }
    });
  });

  return (
    <Page>
      <Header />
      <Box marginBottom={1}>
        <Text color={COLORS.dim}>Share this room code:</Text>
      </Box>
      <Text bold color={COLORS.accent}>
        {code}
      </Text>
      <Box marginTop={2}>
        <Text color={COLORS.text}>
          <Spinner /> Waiting for someone...
        </Text>
      </Box>
      <Box marginTop={2}>
        <Text color={COLORS.hint}>Esc to cancel</Text>
      </Box>
    </Page>
  );
}

async function showWaitingForCall(opts: {
  code: string;
  api: AppContext['api'];
  myPeerId: string;
}): Promise<{ from: string; offer: unknown } | null> {
  return await runScreen<{ from: string; offer: unknown } | null>((resolve) => (
    <WaitingForCallScreen
      code={opts.code}
      api={opts.api}
      myPeerId={opts.myPeerId}
      onDone={resolve}
    />
  ));
}

function WaitingForCallScreen({
  code,
  api,
  myPeerId,
  onDone,
}: {
  code: string;
  api: AppContext['api'];
  myPeerId: string;
  onDone: (result: { from: string; offer: unknown } | null) => void;
}) {
  const [controller] = useState(() => new AbortController());

  // biome-ignore lint/complexity/useMaxParams: ink useInput signature
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      controller.abort();
      onDone(null);
    }
  });

  useStartupEffect(() => {
    waitForCall({ api, roomCode: code, myPeerId, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) {
        onDone(result);
      }
    });
  });

  return (
    <Page>
      <Header />
      <Box marginBottom={2}>
        <Text color={COLORS.dim}>Joined room {code}</Text>
      </Box>
      <Text color={COLORS.text}>
        <Spinner /> Waiting for the call...
      </Text>
      <Box marginTop={2}>
        <Text color={COLORS.hint}>Esc to cancel</Text>
      </Box>
    </Page>
  );
}

async function showError(message: string): Promise<void> {
  return await runScreen<void>((resolve) => <ErrorScreen message={message} onDone={resolve} />);
}

function ErrorScreen({ message, onDone }: { message: string; onDone: () => void }) {
  useInput(() => onDone());

  return (
    <Page>
      <Header />
      <Box marginBottom={2}>
        <Text color={COLORS.error}>{message}</Text>
      </Box>
      <Text color={COLORS.hint}>Press any key to continue</Text>
    </Page>
  );
}

function useStartupEffect(fn: () => void) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    fn();
  }, [fn]);
}
