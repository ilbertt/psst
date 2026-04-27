import { createCli } from '@parshjs/core';
import { commandTree } from '#commandTree.gen.ts';
import { createContext } from '#context.ts';

/** Injected at build time */
declare const __VERSION__: string;

const cli = createCli({
  programName: 'psst',
  programDescription: 'psst — tap someone on the shoulder',
  version: __VERSION__,
  tree: commandTree,
  context: createContext,
});

declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
