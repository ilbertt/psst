type Env = {
  port: number;
  databasePath: string;
};

function loadEnv(): Env {
  return {
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DB_PATH ?? './data/psst.db',
  };
}

export const env = loadEnv();
