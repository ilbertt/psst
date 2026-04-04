import { t } from 'elysia';

export const healthResponse = t.Object({
  status: t.Literal('ok'),
  uptime: t.Number({ minimum: 0 }),
});
