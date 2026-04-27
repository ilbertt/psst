import { join } from 'node:path';
import { createFilesContext, osHomeConfigDir } from '@parshjs/files';
import { z } from 'zod';

export const configSchema = z.object({
  serverUrl: z.string(),
  name: z.string(),
});

export type ConfigData = z.infer<typeof configSchema>;
export type ConfigKey = keyof ConfigData;

export const DEFAULT_CONFIG: ConfigData = {
  serverUrl: 'http://localhost:3000',
  name: 'Anonymous',
};

export const configKeySchema = configSchema.keyof();

export const filesContext = createFilesContext({
  basePath: join(osHomeConfigDir(), 'psst'),
  files: {
    config: { filename: 'config.json', schema: configSchema, defaults: DEFAULT_CONFIG },
  },
});
