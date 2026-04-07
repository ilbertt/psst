import { Elysia, StatusMap } from 'elysia';
import { TurnServicePlugin } from '#services/plugins.ts';
import { iceServersResponse } from './model.ts';

export const turnController = new Elysia({ prefix: '/turn' })
  .use(TurnServicePlugin)

  .get(
    '/credentials',
    async ({ turnService, status }) => {
      const iceServers = await turnService.generateIceServers();
      return status(StatusMap.OK, iceServers);
    },
    { response: { [StatusMap.OK]: iceServersResponse } },
  );
