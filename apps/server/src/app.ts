import { Elysia } from 'elysia';
import { elysiaErrorHandler } from '#lib/errors.ts';
import { healthController } from '#routes/health/controller.ts';
import { roomController } from '#routes/rooms/controller.ts';
import { signalController } from '#routes/signal/controller.ts';
import { turnController } from '#routes/turn/controller.ts';

export const app = new Elysia()
  .onError(elysiaErrorHandler)
  .use(healthController)
  .use(roomController)
  .use(signalController)
  .use(turnController);
