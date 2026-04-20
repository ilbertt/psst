import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { embedNodeDataChannelPlugin } from './embed-node-datachannel';

const BUILD_SCRIPTS_DIR = import.meta.dir;
const APP_DIR = join(BUILD_SCRIPTS_DIR, '..');
const DIST_DIR = join(APP_DIR, 'dist');
const CLI_OUT = join(DIST_DIR, 'psst');
const MC_HELPER_DIR = join(APP_DIR, 'src/services/mc-helper');
const MC_HELPER_SRC = join(MC_HELPER_DIR, 'psst-mc.swift');
const MC_HELPER_BIN = join(MC_HELPER_DIR, 'psst-mc');
const MC_HELPER_PLIST = join(MC_HELPER_DIR, 'Info.plist');

console.log('🧹 Cleaning dist...');
await rm(DIST_DIR, { recursive: true, force: true });

console.log('🍎 Compiling MC helper (swiftc)...');
const swift = Bun.spawnSync([
  'swiftc',
  '-O',
  '-Xlinker',
  '-sectcreate',
  '-Xlinker',
  '__TEXT',
  '-Xlinker',
  '__info_plist',
  '-Xlinker',
  MC_HELPER_PLIST,
  '-o',
  MC_HELPER_BIN,
  MC_HELPER_SRC,
]);
if (swift.exitCode !== 0) {
  console.error('❌ swiftc failed:', swift.stderr.toString());
  process.exit(1);
}

if (process.platform === 'darwin') {
  console.log('🔏 Codesigning MC helper...');
  // Ad-hoc sign so macOS TCC recognises the helper as a principal that can
  // request Local Network permission. Without a signature, the prompt never
  // fires and MC invites are silently dropped.
  const signHelper = Bun.spawnSync([
    'codesign',
    '--force',
    '--sign',
    '-',
    '--identifier',
    'dev.ilbertt.psst.mc-helper',
    '--entitlements',
    join(BUILD_SCRIPTS_DIR, 'entitlements.plist'),
    MC_HELPER_BIN,
  ]);
  if (signHelper.exitCode !== 0) {
    console.error('❌ helper codesign failed:', signHelper.stderr.toString());
    process.exit(1);
  }
}

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

if (process.platform === 'darwin') {
  console.log('🔏 Ad-hoc codesigning with entitlements...');
  const entitlements = join(BUILD_SCRIPTS_DIR, 'entitlements.plist');
  const sign = Bun.spawnSync([
    'codesign',
    '--force',
    '--deep',
    '--sign',
    '-',
    '--entitlements',
    entitlements,
    CLI_OUT,
  ]);
  if (sign.exitCode !== 0) {
    console.error('❌ codesign failed:', sign.stderr.toString());
    process.exit(1);
  }
}

console.log('✅ Done');
