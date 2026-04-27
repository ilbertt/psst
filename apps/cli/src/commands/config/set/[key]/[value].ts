import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('config set [key] [value]', {
  description: 'Set a config value',
  params: { value: { schema: z.string() } },
  options: {},
  handler: async ({ params, parents, context, print }) => {
    const key = parents['config set [key]'].params.key;
    await context.config.set({ [key]: params.value });
    print.success(`  ${key} = ${params.value}`);
  },
});
