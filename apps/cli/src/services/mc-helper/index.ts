import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — resolved at build time via Bun's `with { type: 'file' }`
import embeddedPath from './psst-mc' with { type: 'file' };

// Extract to a stable, content-addressed path so macOS TCC (Local Network
// permission) recognises the same binary across runs. mkdtemp would produce
// a fresh path every launch and the permission never sticks.
const bytes = readFileSync(embeddedPath);
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const outDir = join(homedir(), 'Library', 'Caches', 'psst', 'mc-helper');
const outPath = join(outDir, `psst-mc-${hash}`);

if (!existsSync(outPath)) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, bytes);
  chmodSync(outPath, 0o755);
}

export default outPath;
