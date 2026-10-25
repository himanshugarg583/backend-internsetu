import { createApp } from './app';
import { prisma } from './config/database';
import { env } from './config/env';
import { ensureStorageDirs } from './config/storage';
import { logger } from './utils/logger';

async function main() {
  ensureStorageDirs();
  await prisma.$connect();
  const server = createApp().listen(env.PORT, () => logger.info(`InternSetu API listening on :${env.PORT}`));
  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  logger.fatal(e, 'Failed to start');
  process.exit(1);
});
