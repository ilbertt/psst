import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — resolved at build time via Bun's `with { type: 'file' }`
import embeddedPath from './psst-mc' with { type: 'file' };

const outDir = mkdtempSync(join(tmpdir(), 'psst-mc-'));
const outPath = join(outDir, 'psst-mc');
writeFileSync(outPath, readFileSync(embeddedPath));
chmodSync(outPath, 0o755);

export default outPath;
