import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';

export const COLORS = {
  primary: '#7dd3fc',
  accent: '#fbbf24',
  text: '#ffffff',
  dim: '#6b7280',
  hint: '#4b5563',
  error: '#f87171',
  speaking: '#fbbf24',
  idle: '#374151',
  label: '#e5e7eb',
};

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={2}>
      <Text bold color={COLORS.primary}>
        psst
      </Text>
      {subtitle ? (
        <Box marginTop={1}>
          <Text color={COLORS.dim}>{subtitle}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={1}>
      {children}
    </Box>
  );
}

export function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return <Text>{SPINNER_FRAMES[frame]}</Text>;
}

interface SelectOption<T extends string> {
  label: string;
  value: T;
}

interface SelectProps<T extends string> {
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  onCancel?: () => void;
}

export function Select<T extends string>({ options, onSelect, onCancel }: SelectProps<T>) {
  const [index, setIndex] = useState(0);

  // biome-ignore lint/complexity/useMaxParams: ink useInput signature
  useInput((_input, key) => {
    if (key.upArrow) {
      setIndex((i) => (i - 1 + options.length) % options.length);
      return;
    }
    if (key.downArrow) {
      setIndex((i) => (i + 1) % options.length);
      return;
    }
    if (key.return) {
      const option = options[index];
      if (option) {
        onSelect(option.value);
      }
      return;
    }
    if (key.escape) {
      onCancel?.();
    }
  });

  return (
    <Box flexDirection="column">
      {options.map((option) => {
        const selected = option.value === options[index]?.value;
        return (
          <Box key={option.value} marginY={0}>
            <Text color={selected ? COLORS.primary : COLORS.text} bold={selected}>
              {selected ? '▸ ' : '  '}
              {option.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  maxLength?: number;
  uppercase?: boolean;
  color?: string;
}

export function TextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  maxLength,
  uppercase,
  color,
}: TextInputProps) {
  // biome-ignore lint/complexity/useMaxParams: ink useInput signature
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta || key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
      return;
    }
    if (!input) {
      return;
    }
    const next = uppercase ? input.toUpperCase() : input;
    const combined = value + next;
    const truncated = maxLength ? combined.slice(0, maxLength) : combined;
    onChange(truncated);
  });

  const display = value.length === 0 && placeholder ? placeholder : value;
  const isPlaceholder = value.length === 0 && !!placeholder;

  return (
    <Text color={isPlaceholder ? COLORS.dim : (color ?? COLORS.text)}>
      {display}
      <Text color={COLORS.accent}>▌</Text>
    </Text>
  );
}
