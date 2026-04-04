import type { CommandContext } from '@stricli/core';
import { ApiClient } from '#services/api-client.ts';
import { ConfigManager } from '#services/config-manager.ts';

export interface AppContext extends CommandContext {
  readonly api: ApiClient;
  readonly config: ConfigManager;
}

export function createContext(): AppContext {
  const config = new ConfigManager();
  const api = new ApiClient(config.serverUrl);
  return {
    process,
    api,
    config,
  };
}
