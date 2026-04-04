import { runMigrations } from '#db/migrate.ts';
import { env } from '#lib/env.ts';
import { logger } from '#lib/logger.ts';

runMigrations();

// Import the app dynamically to let the migrations run first
const { app } = await import('#app.ts');

app.listen({ port: env.port, hostname: '0.0.0.0' });
logger.info(`listening on :${env.port}`);
