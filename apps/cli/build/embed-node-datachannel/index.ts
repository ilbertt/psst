import { join } from 'node:path';
import type { BunPlugin } from 'bun';

const SHIM_PATH = join(import.meta.dir, 'shim.ts');

export const embedNodeDataChannelPlugin: BunPlugin = {
  name: 'embed-node-datachannel-native',
  setup(build) {
    // node-datachannel's `dist/esm/lib/node-datachannel.mjs` uses a runtime
    // `createRequire(...)` to load its native `.node` binary, which Bun's
    // bundler doesn't trace. Redirect the whole module to our shim, which
    // embeds the `.node` and extracts it at runtime.
    build.onResolve({ filter: /[\\/]node-datachannel\.m?js$/ }, () => ({
      path: SHIM_PATH,
    }));
  },
};
