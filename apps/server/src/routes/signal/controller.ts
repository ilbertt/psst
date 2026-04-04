import { Elysia, StatusMap, t } from 'elysia';
import { PeerIdHeaderSchema, TimeoutResponseSchema } from '#lib/schemas.ts';
import { SignalServicePlugin } from '#services/plugins.ts';
import {
  answerBody,
  callBody,
  callPollResponse,
  callResponse,
  iceBody,
  icePollResponse,
} from './model.ts';

export const signalRoutes = new Elysia({ prefix: '/rooms/:code' })
  .use(SignalServicePlugin)

  .post(
    '/call/:peerId',
    async ({ signalService, params: { peerId }, body, headers, status }) => {
      const callerId = headers['psst-peer-id'];
      const result = await signalService.call({
        callerId,
        targetPeerId: peerId,
        offer: body.offer,
      });
      if (!result) {
        return status(StatusMap['Request Timeout'], { status: 'timeout' as const });
      }
      return status(StatusMap.OK, result);
    },
    {
      body: callBody,
      headers: PeerIdHeaderSchema,
      response: {
        [StatusMap.OK]: callResponse,
        [StatusMap['Request Timeout']]: TimeoutResponseSchema,
      },
    },
  )

  .get(
    '/calls/poll',
    async ({ signalService, headers, status }) => {
      const peerId = headers['psst-peer-id'];
      const result = await signalService.pollCalls(peerId);
      if (!result) {
        return status(StatusMap['Request Timeout'], { status: 'timeout' as const });
      }
      return status(StatusMap.OK, result);
    },
    {
      headers: PeerIdHeaderSchema,
      response: {
        [StatusMap.OK]: callPollResponse,
        [StatusMap['Request Timeout']]: TimeoutResponseSchema,
      },
    },
  )

  .post(
    '/calls/answer/:peerId',
    ({ signalService, params: { peerId }, body, status }) => {
      const ok = signalService.answer({ callerPeerId: peerId, answer: body.answer });
      if (!ok) {
        return status(StatusMap['Request Timeout'], { status: 'timeout' as const });
      }
      return status(StatusMap['No Content'], undefined);
    },
    {
      body: answerBody,
      response: {
        [StatusMap['No Content']]: t.Undefined(),
        [StatusMap['Request Timeout']]: TimeoutResponseSchema,
      },
    },
  )

  .post(
    '/ice/:peerId',
    ({ signalService, params: { peerId }, body, headers, status }) => {
      const fromId = headers['psst-peer-id'];
      signalService.sendIce({
        fromPeerId: fromId,
        targetPeerId: peerId,
        candidate: body.candidate,
      });
      return status(StatusMap['No Content'], undefined);
    },
    {
      body: iceBody,
      headers: PeerIdHeaderSchema,
      response: { [StatusMap['No Content']]: t.Undefined() },
    },
  )

  .get(
    '/ice/poll',
    async ({ signalService, headers, status }) => {
      const peerId = headers['psst-peer-id'];
      const result = await signalService.pollIce(peerId);
      if (!result) {
        return status(StatusMap['Request Timeout'], { status: 'timeout' as const });
      }
      return status(StatusMap.OK, result);
    },
    {
      headers: PeerIdHeaderSchema,
      response: {
        [StatusMap.OK]: icePollResponse,
        [StatusMap['Request Timeout']]: TimeoutResponseSchema,
      },
    },
  );
