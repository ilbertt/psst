import { buildApplication, buildRouteMap, run } from '@stricli/core';
import { rootCommand } from '#commands/_root.ts';
import { configSet } from '#commands/config/set.ts';
import { configShow } from '#commands/config/show.ts';
import { createContext } from '#context.ts';

const configRoutes = buildRouteMap({
  routes: {
    set: configSet,
    show: configShow,
  },
  defaultCommand: 'show',
  docs: {
    brief: 'Manage configuration',
  },
});

const root = buildRouteMap({
  routes: {
    _root: rootCommand,
    config: configRoutes,
  },
  defaultCommand: '_root',
  docs: {
    brief: 'psst — tap someone on the shoulder',
    hideRoute: { _root: true },
  },
});

const app = buildApplication(root, {
  name: 'psst',
  versionInfo: {
    currentVersion: '0.1.0',
  },
});

await run(app, process.argv.slice(2), createContext());
