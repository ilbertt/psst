import { buildCommand } from '@stricli/core';
import type { AppContext } from '#context.ts';
import { ConfigManager } from '#services/config-manager.ts';

export const configSet = buildCommand({
  docs: {
    brief: 'Set a config value',
  },
  parameters: {
    flags: {},
    positional: {
      kind: 'tuple',
      parameters: [
        { brief: `Config key (${ConfigManager.validKeys.join(', ')})`, parse: String },
        { brief: 'Config value', parse: String },
      ],
    },
  },
  // biome-ignore lint/complexity/useMaxParams: Stricli func signature
  async func(this: AppContext, _flags, key, value) {
    if (!ConfigManager.isValidKey(key)) {
      this.process.stderr.write(
        `Unknown key: ${key}. Valid: ${ConfigManager.validKeys.join(', ')}\n`,
      );
      return;
    }
    this.config.update({ [key]: value });
    this.process.stdout.write(`  ${key} = ${value}\n`);
  },
} satisfies Parameters<
  typeof buildCommand<Record<string, never>, [string, string], AppContext>
>[0]);
