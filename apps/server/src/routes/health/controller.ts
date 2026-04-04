import { Elysia, StatusMap } from 'elysia';
import { healthResponse } from '#routes/health/model.ts';
import { HealthServicePlugin } from '#services/plugins.ts';

export const healthController = new Elysia().use(HealthServicePlugin).get(
  '/health',
  ({ healthService, status }) => {
    return status(StatusMap.OK, healthService.check());
  },
  { response: { [StatusMap.OK]: healthResponse } },
);
