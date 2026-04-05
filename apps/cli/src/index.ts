import { buildApplication, buildRouteMap, run } from '@stricli/core';
import { configSet } from '#commands/config/set.ts';
import { configShow } from '#commands/config/show.ts';
import { createRoom } from '#commands/room/create.ts';
import { joinRoom } from '#commands/room/join.ts';
import { createContext } from '#context.ts';

const roomRoutes = buildRouteMap({
  routes: {
    create: createRoom,
    join: joinRoom,
  },
  defaultCommand: 'create',
  docs: {
    brief: 'Create or join a room',
  },
});

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
    room: roomRoutes,
    config: configRoutes,
  },
  docs: {
    brief: 'psst — tap someone on the shoulder',
  },
});

const app = buildApplication(root, {
  name: 'psst',
  versionInfo: {
    currentVersion: '0.1.0',
  },
});

await run(app, process.argv.slice(2), createContext());
