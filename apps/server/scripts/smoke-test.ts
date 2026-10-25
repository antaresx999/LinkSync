/**
 * Rauchtest gegen einen laufenden Server.
 * Zwei simulierte Geräte legen ein Konto an und synchronisieren übers Netzwerk.
 *
 *   pnpm --filter @linksync/server smoke                 (Server auf localhost:8080)
 *   pnpm --filter @linksync/server smoke https://…       (anderer Server)
 */

import { BookmarkTree, Clock, createId, createNodeId, deriveKeys, LinkSyncClient, SyncEngine } from '@linksync/core';

const serverUrl = process.argv[2] ?? 'http://localhost:8080';
const client = new LinkSyncClient(serverUrl);

const info = await client.getInfo();
console.log(`✓ Server erreichbar: ${info.name} ${info.version}, Protokoll ${info.protocol}`);

const syncId = createId();
const started = Date.now();
const keys = await deriveKeys(syncId, `test-${createId()}`);
console.log(`✓ Schlüssel abgeleitet (${Date.now() - started} ms)`);

await client.createAccount(syncId, keys.authToken);
console.log(`✓ Testkonto angelegt: ${syncId}`);

const device = () => {
  const tree = new BookmarkTree(new Clock(createNodeId()));
  return { tree, engine: new SyncEngine(tree, keys.encryptionKey, client.transport(syncId, keys.authToken)) };
};
const a = device();
const b = device();

const folder = a.tree.addFolder('toolbar', 'Rauchtest');
for (let i = 1; i <= 50; i++) a.tree.addBookmark(folder, `Lesezeichen ${i}`, `https://example.com/${i}`);
const sent = await a.engine.sync();
console.log(`✓ Gerät A hat ${sent.sent} Einträge hochgeladen`);

const received = await b.engine.sync();
const same = JSON.stringify(a.tree.toTree()) === JSON.stringify(b.tree.toTree());
console.log(`✓ Gerät B hat ${received.received} Einträge empfangen, Bäume gleich: ${same ? 'ja' : 'NEIN'}`);

await client.deleteAccount(syncId, keys.authToken);
console.log('✓ Testkonto wieder gelöscht');

if (!same) process.exit(1);
console.log('\nAlles in Ordnung.');
