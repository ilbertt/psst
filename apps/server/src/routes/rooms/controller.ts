import { Elysia, StatusMap } from 'elysia';
import { PeerIdHeaderSchema, TimeoutResponseSchema } from '#lib/schemas.ts';
import { LoggerPlugin, RoomServicePlugin } from '#services/plugins.ts';
import {
  createRoomBody,
  joinResponse,
  joinRoomBody,
  peersResponse,
  roomResponse,
} from './model.ts';

export const roomController = new Elysia({ prefix: '/rooms' })
  .use(RoomServicePlugin)
  .use(LoggerPlugin)

  .post(
    '/',
    ({ roomService, body, status }) => {
      const room = roomService.create(body.name);
      return status(StatusMap.OK, {
        code: room.code,
        name: room.name,
        createdAt: room.created_at,
      });
    },
    { body: createRoomBody, response: { [StatusMap.OK]: roomResponse } },
  )

  .get(
    '/:code/peers',
    async ({ roomService, params: { code }, headers, request, server, logger, status }) => {
      if (server) {
        server.timeout(request, 0);
      }

      const peerId = headers['psst-peer-id'];
      logger.info(`peers poll parked peer_id=${peerId} room=${code}`);

      const result = await roomService.pollPeers({ code, excludePeerId: peerId });

      if (result === null) {
        return status(StatusMap['Request Timeout'], { status: 'timeout' as const });
      }

      return status(
        StatusMap.OK,
        result.map((p) => ({ id: p.id, name: p.name, joinedAt: p.joined_at })),
      );
    },
    {
      headers: PeerIdHeaderSchema,
      response: {
        [StatusMap.OK]: peersResponse,
        [StatusMap['Request Timeout']]: TimeoutResponseSchema,
      },
    },
  )

  .post(
    '/:code/join',
    ({ roomService, params: { code }, body, status }) => {
      const peer = roomService.join({ code, name: body.name });
      return status(StatusMap.OK, { peerId: peer.id });
    },
    { body: joinRoomBody, response: { [StatusMap.OK]: joinResponse } },
  );
