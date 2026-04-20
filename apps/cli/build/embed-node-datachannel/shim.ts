import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — `.node` file resolved at build time via Bun's `with { type: 'file' }`
import embeddedPath from '../../../../node_modules/node-datachannel/build/Release/node_datachannel.node' with {
  type: 'file',
};

const outDir = mkdtempSync(join(tmpdir(), 'psst-ndc-'));
const outPath = join(outDir, 'node_datachannel.node');
writeFileSync(outPath, readFileSync(embeddedPath));

const require = createRequire('/');
// biome-ignore lint/suspicious/noExplicitAny: native addon has no typed surface here
const nativeModule: any = require(outPath);

export default nativeModule;
