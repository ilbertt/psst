import { defineCommand } from '@parshjs/core';

export const command = defineCommand('config show', {
  description: 'Show current config',
  options: {},
  handler: ({ context, print }) => {
    for (const [key, value] of Object.entries(context.config.value)) {
      print.info(`  ${key} = ${value}`);
    }
  },
});
