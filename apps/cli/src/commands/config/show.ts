import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';

export const configShow = buildCommand({
  docs: {
    brief: 'Show current config',
  },
  parameters: { flags: {} },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags) {
    const config = this.config.all;
    for (const [key, value] of Object.entries(config)) {
      this.process.stdout.write(`  ${key} = ${value}\n`);
    }
  },
} satisfies Parameters<typeof buildCommand<Record<string, never>, [], AppContext>>[0]);
