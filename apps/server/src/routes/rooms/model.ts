import { t } from 'elysia';

export const createRoomBody = t.Object({
  name: t.Optional(t.String()),
});

export const joinRoomBody = t.Object({
  name: t.String({ minLength: 1 }),
});

export const roomResponse = t.Object({
  code: t.String(),
  name: t.String(),
  createdAt: t.String(),
});

export const peerResponse = t.Object({
  id: t.String(),
  name: t.String(),
  joinedAt: t.String(),
});

export const peersResponse = t.Array(peerResponse);

export const joinResponse = t.Object({
  peerId: t.String(),
});
