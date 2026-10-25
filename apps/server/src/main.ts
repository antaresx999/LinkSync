/** Startet den LinkSync-Server. */

import { serve } from '@hono/node-server';
import { createApp, SERVER_VERSION } from './app';
import { loadConfig } from './config';
import { Database } from './db';

const config = loadConfig();
const db = new Database(config.databasePath);
const app = createApp(db, config);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`LinkSync-Server ${SERVER_VERSION} läuft auf http://localhost:${info.port}`);
  console.log(`Datenbank: ${config.databasePath}`);
  console.log(`Neue Konten erlaubt: ${config.allowNewAccounts ? 'ja' : 'nein'}`);
});

// Sauber beenden (z. B. bei Ctrl-C oder "docker stop").
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('Server wird beendet …');
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
