import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { ConfigError, databasePath, loadConfig, type Config } from './config.ts';
import { openDatabase } from './db/database.ts';
import { purgeExpiredTakeovers } from './data/takeovers.ts';
import { usersWithoutPassword } from './data/users.ts';
import { takeoverDir } from './routes/takeovers.ts';
import { readVersion } from './web.ts';

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}

const db = openDatabase(databasePath(config));
const version = readVersion(config.webDir);
const app = createApp({ db, config, version, clock: Date.now }, { serveWeb: true });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Congress-hall sign listening on http://${info.address}:${info.port} (version ${version})`);
});

// Takeover images are ephemeral: delete them as soon as their time is over, even if no sign is polling.
const purge = () => void purgeExpiredTakeovers(db, takeoverDir(config.dataDir), Date.now()).catch(console.error);
purge();
setInterval(purge, 60_000).unref();

for (const username of usersWithoutPassword(db)) {
  console.warn(
    `User "${username}" has no password and can't log in yet. Set one with: npm run passwd -- ${username}` +
      ` (in the container: node src/server/cli.ts passwd ${username})`,
  );
}

function shutdown() {
  // Don't wait for browsers' keep-alive connections: they would hold the stop for seconds.
  if ('closeIdleConnections' in server) server.closeIdleConnections();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
