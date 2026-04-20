import { join } from 'node:path';
import type { BunPlugin } from 'bun';

const SHIM_PATH = join(import.meta.dir, 'shim.ts');

export const embedNodeDataChannelPlugin: BunPlugin = {
  name: 'embed-node-datachannel-native',
  setup(build) {
    build.onResolve({ filter: /node_datachannel\.node$/ }, () => ({
      path: SHIM_PATH,
    }));
  },
};
