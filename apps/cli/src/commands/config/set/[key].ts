import { defineCommand } from '@parshjs/core';
import { configKeySchema } from '#files.ts';

export const command = defineCommand('config set [key]', {
  params: { key: { schema: configKeySchema } },
  hidden: true,
  options: {},
});
