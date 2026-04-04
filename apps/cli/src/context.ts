import type { CommandContext } from '@stricli/core';
import { createApiClient } from '#services/api-client.ts';
import { ConfigManager } from '#services/config-manager.ts';

export interface AppContext extends CommandContext {
  readonly api: ReturnType<typeof createApiClient>;
  readonly config: ConfigManager;
}

export function createContext(): AppContext {
  const config = new ConfigManager();
  return {
    process,
    api: createApiClient(config.serverUrl),
    config,
  };
}
