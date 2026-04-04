import { Elysia } from 'elysia';
import { elysiaErrorHandler } from '#lib/errors.ts';
import { healthController } from '#routes/health/controller.ts';
import { roomRoutes } from '#routes/rooms/controller.ts';
import { signalRoutes } from '#routes/signal/controller.ts';
import { LoggerPlugin } from '#services/plugins.ts';

export const app = new Elysia()
  .onError(elysiaErrorHandler)
  .use(LoggerPlugin)
  .use(healthController)
  .use(roomRoutes)
  .use(signalRoutes);
