import { Elysia, StatusMap } from 'elysia';
import { RoomServicePlugin } from '#services/plugins.ts';
import {
  createRoomBody,
  joinResponse,
  joinRoomBody,
  peersResponse,
  roomResponse,
} from './model.ts';

export const roomRoutes = new Elysia({ prefix: '/rooms' })
  .use(RoomServicePlugin)

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
    ({ roomService, params: { code }, status }) => {
      const peers = roomService.peers(code);
      return status(
        StatusMap.OK,
        peers.map((p) => ({ id: p.id, name: p.name, joinedAt: p.joined_at })),
      );
    },
    { response: { [StatusMap.OK]: peersResponse } },
  )

  .post(
    '/:code/join',
    ({ roomService, params: { code }, body, status }) => {
      const peer = roomService.join({ code, name: body.name });
      return status(StatusMap.OK, { peerId: peer.id });
    },
    { body: joinRoomBody, response: { [StatusMap.OK]: joinResponse } },
  );
