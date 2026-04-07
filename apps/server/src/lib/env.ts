type Env = {
  port: number;
  databasePath: string;
  cfTurnKeyId: string;
  cfTurnApiToken: string;
};

function loadEnv(): Env {
  return {
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DB_PATH ?? './data/psst.db',
    cfTurnKeyId: process.env.CF_TURN_KEY_ID ?? '',
    cfTurnApiToken: process.env.CF_TURN_API_TOKEN ?? '',
  };
}

export const env = loadEnv();
