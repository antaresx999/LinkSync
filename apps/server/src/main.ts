/** Startet den LinkSync-Server. */

import { serve } from '@hono/node-server';
import { createApp, SERVER_VERSION } from './app';
import { loadConfig } from './config';
import { Database } from './db';

const config = loadConfig();
const db = new Database(config.databasePath);
const app = createApp(db, config);

// Unbenutzte Konten aufräumen (falls eingeschaltet): beim Start und dann täglich.
const DAY = 24 * 60 * 60 * 1000;
function cleanup() {
  if (config.deleteInactiveAfterDays <= 0) return;
  const removed = db.deleteInactiveAccounts(Date.now() - config.deleteInactiveAfterDays * DAY);
  if (removed > 0) console.log(`${removed} unbenutzte Konten gelöscht.`);
}
cleanup();
const cleanupTimer = setInterval(cleanup, DAY);
cleanupTimer.unref();

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`LinkSync-Server ${SERVER_VERSION} läuft auf http://${config.host}:${info.port}`);
  console.log(`Datenbank: ${config.databasePath}`);
  console.log(`Neue Konten erlaubt: ${config.allowNewAccounts ? 'ja' : 'nein'}`);
  console.log(`Hinter Reverse-Proxy: ${config.trustProxy ? 'ja' : 'nein'}`);
  if (config.deleteInactiveAfterDays > 0) {
    console.log(`Unbenutzte Konten werden nach ${config.deleteInactiveAfterDays} Tagen gelöscht.`);
  }
});

// Sauber beenden (z. B. bei Ctrl-C, "docker stop" oder "systemctl stop").
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('Server wird beendet …');
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
