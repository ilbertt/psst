import { buildApplication, buildRouteMap, run } from '@stricli/core';
import { configSet } from '#commands/config/set.ts';
import { listen } from '#commands/listen.ts';
import { createRoom } from '#commands/room/create.ts';
import { joinRoom } from '#commands/room/join.ts';
import { leaveRoom } from '#commands/room/leave.ts';
import { talk } from '#commands/talk.ts';
import { createContext } from '#context.ts';

const roomRoutes = buildRouteMap({
  routes: {
    create: createRoom,
    join: joinRoom,
    leave: leaveRoom,
  },
  defaultCommand: 'create',
  docs: {
    brief: 'Create or manage rooms',
  },
});

const configRoutes = buildRouteMap({
  routes: {
    set: configSet,
  },
  docs: {
    brief: 'Manage configuration',
  },
});

const root = buildRouteMap({
  routes: {
    room: roomRoutes,
    config: configRoutes,
    talk,
    listen,
  },
  defaultCommand: 'talk',
  docs: {
    brief: 'P2P voice chat for coworkers',
  },
});

const app = buildApplication(root, {
  name: 'psst',
  versionInfo: {
    currentVersion: '0.1.0',
  },
});

await run(app, process.argv.slice(2), createContext());
