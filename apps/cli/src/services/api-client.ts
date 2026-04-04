import { edenFetch } from '@elysiajs/eden';
import type { App } from '@repo/server/types';

export function createApiClient(baseUrl: string) {
  return edenFetch<App>(baseUrl);
}

export function formatEdenError(error: { status: number; value?: unknown }): string {
  const value = error.value;
  if (value instanceof Error) {
    return `status=${error.status} ${value.message}`;
  }
  if (value !== null) {
    return `status=${error.status} ${JSON.stringify(value)}`;
  }
  return `status=${error.status}`;
}
