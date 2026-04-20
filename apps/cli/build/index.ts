import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { embedNodeDataChannelPlugin } from './embed-node-datachannel';

const APP_DIR = join(import.meta.dir, '..');
const DIST_DIR = join(APP_DIR, 'dist');
const CLI_OUT = join(DIST_DIR, 'psst');

console.log('🧹 Cleaning dist...');
await rm(DIST_DIR, { recursive: true, force: true });

console.log('🔨 Compiling binary...');
const buildResult = await Bun.build({
  entrypoints: ['./src/index.ts'],
  compile: { outfile: CLI_OUT },
  minify: { whitespace: true, syntax: true },
  bytecode: true,
  format: 'esm',
  plugins: [embedNodeDataChannelPlugin],
});

if (!buildResult.success) {
  console.error('❌ Build failed:', JSON.stringify(buildResult, null, 2));
  process.exit(1);
}

const built = await Promise.all(
  buildResult.outputs.map(async (o) => {
    const size = (await Bun.file(o.path).stat()).size;
    return `${o.path.replace(`${APP_DIR}/`, '')} (${(size / 1024 / 1024).toFixed(1)} MB)`;
  }),
);
console.log(`📦 Built: ${built.join(', ')}`);

console.log('✅ Done');
