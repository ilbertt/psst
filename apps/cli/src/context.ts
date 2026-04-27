import { filesContext } from '#files.ts';
import { createApiClient } from '#services/api-client.ts';

export type AppContext = Awaited<ReturnType<typeof createContext>>;

export async function createContext() {
  const config = await filesContext.config.load();
  return {
    api: createApiClient(config.value.serverUrl),
    config,
  };
}
