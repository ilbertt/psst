import { Box, render, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import type { CallStats } from '#services/call.ts';
import type { Peer } from '#types.ts';
import { COLORS, Header } from './components.tsx';

const SPEAKING_THRESHOLD = 0.2;
const ANIMATION_INTERVAL_MS = 80;
const TIMER_INTERVAL_MS = 1000;

const FACE_TOP = '╭───╮';
const FACE_EYES = '│● ●│';
const FACE_BOTTOM = '╰───╯';
const MOUTHS = ['│ ─ │', '│ o │', '│ O │', '│ ◯ │'];

function statusLabel(state: string): string {
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
}

function isPending(state: string): boolean {
  return state === 'new' || state === 'connecting';
}

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

function Person({ name, level }: { name: string; level: number }) {
  const mouth = levelToMouth(level);
  const color = level >= SPEAKING_THRESHOLD ? COLORS.speaking : COLORS.idle;
  return (
    <Box flexDirection="column" alignItems="center" marginX={4}>
      <Text color={color}>{FACE_TOP}</Text>
      <Text color={color}>{FACE_EYES}</Text>
      <Text color={color}>{mouth}</Text>
      <Text color={color}>{FACE_BOTTOM}</Text>
      <Box marginTop={1}>
        <Text color={COLORS.label}>{name}</Text>
      </Box>
    </Box>
  );
}

function formatElapsed(ms: number): string {
  const elapsed = Math.floor(ms / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function TalkingScreen({
  peer,
  stats,
  onDone,
}: {
  peer: Peer;
  stats: CallStats;
  onDone: () => void;
}) {
  const [localLevel, setLocalLevel] = useState(0);
  const [remoteLevel, setRemoteLevel] = useState(0);
  const [elapsed, setElapsed] = useState('00:00');
  const [statusText, setStatusText] = useState('connecting');
  const [startTime] = useState(() => Date.now());

  // biome-ignore lint/complexity/useMaxParams: ink useInput signature
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onDone();
    }
  });

  useEffect(() => {
    const id = setInterval(() => {
      setLocalLevel(stats.localLevel);
      setRemoteLevel(stats.remoteLevel);
      const label = statusLabel(stats.connectionState);
      const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
      setStatusText(isPending(stats.connectionState) ? `${label}${dots}` : label);
    }, ANIMATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [stats]);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(formatElapsed(Date.now() - startTime));
    }, TIMER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Header />
      <Box flexDirection="row" alignItems="flex-start" justifyContent="center">
        <Person name="You" level={localLevel} />
        <Person name={peer.name} level={remoteLevel} />
      </Box>
      <Box marginTop={2}>
        <Text color={COLORS.dim}>{elapsed}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={COLORS.hint}>{statusText}</Text>
      </Box>
      <Box marginTop={2}>
        <Text color={COLORS.hint}>Ctrl+C to hang up</Text>
      </Box>
    </Box>
  );
}

export async function showTalkingScreen({
  peer,
  stats,
}: {
  peer: Peer;
  stats: CallStats;
}): Promise<void> {
  return await new Promise<void>((resolve) => {
    const instance = render(
      <TalkingScreen
        peer={peer}
        stats={stats}
        onDone={() => {
          instance.unmount();
          resolve();
        }}
      />,
      { exitOnCtrlC: false },
    );
  });
}
