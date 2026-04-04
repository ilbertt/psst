import { Elysia } from 'elysia';
import { db } from '#db/client.ts';
import { logger } from '#lib/logger.ts';
import { HealthRepository } from '#repositories/health.repository.ts';
import { PeerRepository } from '#repositories/peer.repository.ts';
import { RoomRepository } from '#repositories/room.repository.ts';
import { HealthService } from '#services/health.service.ts';
import { RoomService } from '#services/room.service.ts';
import { SignalService } from '#services/signal.service.ts';

const healthRepo = new HealthRepository(db);
const roomRepo = new RoomRepository(db);
const peerRepo = new PeerRepository(db);

const healthService = new HealthService(healthRepo);
const roomService = new RoomService({ roomRepo, peerRepo });
const signalService = new SignalService();

export const LoggerPlugin = new Elysia({ name: 'logger' })
  .decorate('logger', logger)
  .onRequest(({ request }) => {
    logger.info(`→ ${request.method} ${new URL(request.url).pathname}`);
  });

export const HealthServicePlugin = new Elysia({ name: 'service.health' }).decorate(
  'healthService',
  healthService,
);

export const RoomServicePlugin = new Elysia({ name: 'service.room' }).decorate(
  'roomService',
  roomService,
);

export const SignalServicePlugin = new Elysia({ name: 'service.signal' }).decorate(
  'signalService',
  signalService,
);
