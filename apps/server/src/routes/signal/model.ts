import { t } from 'elysia';

export const callBody = t.Object({
  offer: t.Unknown(),
});

export const callResponse = t.Object({
  answer: t.Unknown(),
});

export const callPollResponse = t.Object({
  from: t.String(),
  offer: t.Unknown(),
});

export const answerBody = t.Object({
  answer: t.Unknown(),
});

export const iceBody = t.Object({
  candidate: t.Unknown(),
});

export const icePollResponse = t.Object({
  from: t.String(),
  candidate: t.Unknown(),
});
