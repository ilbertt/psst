import { t } from 'elysia';

export const iceServerSchema = t.Object({
  urls: t.Array(t.String()),
  username: t.Optional(t.String()),
  credential: t.Optional(t.String()),
});

export const iceServersResponse = t.Array(iceServerSchema);
