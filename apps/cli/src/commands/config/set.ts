import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';

export const configSet = buildCommand({
  docs: {
    brief: 'Set a config value',
    customUsage: [
      {
        input: 'psst config set name "Alice"',
        brief: 'Set your display name',
      },
      {
        input: 'psst config set serverUrl https://psst.dev',
        brief: 'Set server URL',
      },
    ],
  },
  parameters: {
    flags: {},
    positional: {
      kind: 'tuple',
      parameters: [
        { brief: 'Config key', parse: String },
        { brief: 'Config value', parse: String },
      ],
    },
  },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags, key, value) {
    this.config.set({ key, value });
    this.process.stdout.write(`  ${key} = ${value}\n`);
  },
} satisfies Parameters<
  typeof buildCommand<Record<string, never>, [string, string], AppContext>
>[0]);
