import { t } from 'elysia';

export const PeerIdHeaderSchema = t.Object({
  'psst-peer-id': t.String(),
});

export const TimeoutResponseSchema = t.Object({
  status: t.Literal('timeout'),
});
