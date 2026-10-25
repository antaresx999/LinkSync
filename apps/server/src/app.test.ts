import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AuthError,
  BookmarkTree,
  Clock,
  createId,
  deriveKeys,
  LinkSyncClient,
  ServerError,
  SyncEngine,
  type SyncKeys,
} from '@linksync/core';
import { createApp } from './app';
import { loadConfig, type Config } from './config';
import { Database } from './db';

const SERVER = 'http://linksync.test';

function setup(overrides: Partial<Config> = {}, db = new Database(':memory:'), now?: () => number) {
  const config = { ...loadConfig({}), newAccountsPerHour: 0, ...overrides };
  const app = createApp(db, config, { now });
  // Statt über das Netzwerk direkt an die App schicken.
  const client = new LinkSyncClient(SERVER, async (url, init) => app.fetch(new Request(url, init)));
  const raw = async (path: string, init?: RequestInit) => app.fetch(new Request(SERVER + path, init));
  return { db, app, client, raw };
}

let keys: SyncKeys;
let otherKeys: SyncKeys;
const syncId = createId();
beforeAll(async () => {
  keys = await deriveKeys(syncId, 'richtiges-passwort', 1000);
  otherKeys = await deriveKeys(syncId, 'falsches-passwort', 1000);
});

describe('Server-Info', () => {
  it('meldet Name, Version und Protokoll', async () => {
    const { client } = setup({ message: 'Hallo' });
    expect(await client.getInfo()).toMatchObject({ name: 'LinkSync', protocol: 1, allowNewAccounts: true, message: 'Hallo' });
  });

  it('antwortet auf /health', async () => {
    const res = await setup().raw('/health');
    expect(await res.text()).toBe('ok');
  });
});

describe('Konten', () => {
  it('legt ein Konto an und lehnt doppelte Sync-IDs ab', async () => {
    const { client } = setup();
    await client.createAccount(syncId, keys.authToken);
    await expect(client.createAccount(syncId, keys.authToken)).rejects.toMatchObject({ status: 409 });
  });

  it('speichert nur den Hash des Tokens', async () => {
    const { client, db } = setup();
    await client.createAccount(syncId, keys.authToken);
    const account = db.getAccount(syncId)!;
    expect(account.authTokenHash).not.toBe(keys.authToken);
    expect(account.authTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lehnt ungültige Sync-IDs ab', async () => {
    const { client } = setup();
    await expect(client.createAccount('keine-uuid', keys.authToken)).rejects.toMatchObject({ status: 400 });
  });

  it('nimmt keine neuen Konten an, wenn das abgeschaltet ist', async () => {
    const { client } = setup({ allowNewAccounts: false });
    await expect(client.createAccount(syncId, keys.authToken)).rejects.toMatchObject({ status: 403 });
  });

  it('verweigert Zugriff mit falschem Passwort oder unbekanntem Konto', async () => {
    const { client } = setup();
    await client.createAccount(syncId, keys.authToken);
    await expect(client.transport(syncId, otherKeys.authToken).pull(0)).rejects.toThrow(AuthError);
    await expect(client.transport(createId(), keys.authToken).pull(0)).rejects.toThrow(AuthError);
  });

  it('verweigert Zugriff ohne Token', async () => {
    const { client, raw } = setup();
    await client.createAccount(syncId, keys.authToken);
    expect((await raw(`/v1/accounts/${syncId}/records`)).status).toBe(401);
  });

  it('löscht ein Konto mit allen Daten', async () => {
    const { client, db } = setup();
    await client.createAccount(syncId, keys.authToken);
    await client.deleteAccount(syncId, keys.authToken);
    expect(db.getAccount(syncId)).toBeUndefined();
    await expect(client.transport(syncId, keys.authToken).pull(0)).rejects.toThrow(AuthError);
  });
});

describe('Einträge', () => {
  async function withAccount(overrides: Partial<Config> = {}) {
    const s = setup(overrides);
    await s.client.createAccount(syncId, keys.authToken);
    return { ...s, transport: s.client.transport(syncId, keys.authToken) };
  }

  it('speichert und liefert Einträge mit fortlaufender Nummer', async () => {
    const { transport } = await withAccount();
    const pushed = await transport.push({
      records: [
        { id: 'a', baseSeq: 0, data: '1.AAAA' },
        { id: 'b', baseSeq: 0, data: '1.BBBB' },
      ],
    });
    expect(pushed).toEqual({ accepted: [{ id: 'a', seq: 1 }, { id: 'b', seq: 2 }], conflicts: [] });
    expect(await transport.pull(0)).toEqual({
      records: [
        { id: 'a', seq: 1, data: '1.AAAA' },
        { id: 'b', seq: 2, data: '1.BBBB' },
      ],
      seq: 2,
      hasMore: false,
    });
    expect((await transport.pull(1)).records.map((r) => r.id)).toEqual(['b']);
  });

  it('meldet Konflikte, wenn ein Gerät einen veralteten Stand überschreiben will', async () => {
    const { transport } = await withAccount();
    await transport.push({ records: [{ id: 'a', baseSeq: 0, data: '1.v1' }] });
    await transport.push({ records: [{ id: 'a', baseSeq: 1, data: '1.v2' }] });
    const stale = await transport.push({ records: [{ id: 'a', baseSeq: 1, data: '1.alt' }] });
    expect(stale).toEqual({ accepted: [], conflicts: ['a'] });
    expect((await transport.pull(0)).records).toEqual([{ id: 'a', seq: 2, data: '1.v2' }]);
  });

  it('liefert grosse Bestände seitenweise', async () => {
    const { client } = await withAccount();
    const records = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, baseSeq: 0, data: `1.x${i}` }));
    await client.transport(syncId, keys.authToken).push({ records });
    const paged = client.transport(syncId, keys.authToken, 10);
    const first = await paged.pull(0);
    expect(first).toMatchObject({ seq: 10, hasMore: true });
    expect(await paged.pull(20)).toMatchObject({ seq: 25, hasMore: false });
  });

  it('hält Konten voneinander getrennt', async () => {
    const { client, transport } = await withAccount();
    await transport.push({ records: [{ id: 'a', baseSeq: 0, data: '1.A' }] });
    const otherId = createId();
    const otherAccountKeys = await deriveKeys(otherId, 'x', 1000);
    await client.createAccount(otherId, otherAccountKeys.authToken);
    expect((await client.transport(otherId, otherAccountKeys.authToken).pull(0)).records).toEqual([]);
  });

  it('lehnt ungültige Anfragen ab', async () => {
    const { transport } = await withAccount();
    const bad = [
      { records: [{ id: 'mit leerzeichen', baseSeq: 0, data: '1.x' }] },
      { records: [{ id: 'a', baseSeq: -1, data: '1.x' }] },
      { records: [{ id: 'a', baseSeq: 0, data: '' }] },
      { records: [{ id: 'a', baseSeq: 0, data: 'x'.repeat(20_000) }] },
      { records: [{ id: 'a', baseSeq: 0, data: '1.x' }, { id: 'a', baseSeq: 0, data: '1.y' }] },
      { records: Array.from({ length: 501 }, (_, i) => ({ id: `r${i}`, baseSeq: 0, data: '1.x' })) },
    ];
    for (const request of bad) {
      await expect(transport.push(request)).rejects.toMatchObject({ status: 400 });
    }
  });

  it('begrenzt die Anzahl Einträge pro Konto und speichert dann nichts', async () => {
    const { transport } = await withAccount({ maxRecordsPerAccount: 3 });
    await transport.push({ records: [{ id: 'a', baseSeq: 0, data: '1.a' }] });
    const tooMany = ['b', 'c', 'd'].map((id) => ({ id, baseSeq: 0, data: '1.x' }));
    await expect(transport.push({ records: tooMany })).rejects.toBeInstanceOf(ServerError);
    expect((await transport.pull(0)).records).toHaveLength(1);
    // Bestehende Einträge ändern geht weiterhin.
    expect((await transport.push({ records: [{ id: 'a', baseSeq: 1, data: '1.a2' }] })).accepted).toHaveLength(1);
  });
});

describe('Ende-zu-Ende: zwei Geräte über den echten Server', () => {
  it('synchronisiert Lesezeichen und führt gleichzeitige Änderungen zusammen', async () => {
    const { client, db } = setup();
    await client.createAccount(syncId, keys.authToken);

    let now = 1_000_000;
    const makeDevice = (nodeId: string) => {
      const tree = new BookmarkTree(new Clock(nodeId, undefined, () => now));
      return { tree, engine: new SyncEngine(tree, keys.encryptionKey, client.transport(syncId, keys.authToken)) };
    };
    const laptop = makeDevice('laptop');
    const desktop = makeDevice('desktop');

    const folder = laptop.tree.addFolder('toolbar', 'Projekte');
    const bm = laptop.tree.addBookmark(folder, 'LinkSync', 'https://github.com/antaresx999/LinkSync');
    await laptop.engine.sync();
    await desktop.engine.sync();
    expect(desktop.tree.toTree()).toEqual(laptop.tree.toTree());

    now += 1000;
    laptop.tree.update(bm, { title: 'LinkSync auf GitHub' });
    desktop.tree.move(bm, 'toolbar', 0);
    desktop.tree.addBookmark('menu', 'Neu vom Desktop', 'https://example.com');
    await laptop.engine.sync();
    await desktop.engine.sync();
    await laptop.engine.sync();

    expect(desktop.tree.toTree()).toEqual(laptop.tree.toTree());
    expect(laptop.tree.children('toolbar')[0]).toMatchObject({ title: 'LinkSync auf GitHub' });
    expect(laptop.tree.children('menu')).toMatchObject([{ title: 'Neu vom Desktop' }]);

    // Der Server enthält nur verschlüsselte Daten.
    const stored = JSON.stringify(db.pull(syncId, 0, 1000));
    expect(stored).not.toContain('LinkSync');
    expect(stored).not.toContain('example.com');
  });
});

describe('Datenbankdatei', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('behält die Daten nach einem Neustart', async () => {
    dir = mkdtempSync(join(tmpdir(), 'linksync-'));
    const path = join(dir, 'sub', 'test.sqlite');
    const first = setup({}, new Database(path));
    await first.client.createAccount(syncId, keys.authToken);
    await first.client.transport(syncId, keys.authToken).push({ records: [{ id: 'a', baseSeq: 0, data: '1.a' }] });
    first.db.close();

    const second = setup({}, new Database(path));
    expect((await second.client.transport(syncId, keys.authToken).pull(0)).records).toHaveLength(1);
    second.db.close();
  });
});

describe('Schutz vor Missbrauch', () => {
  const fromIp = (ip: string) => ({ headers: { 'X-Forwarded-For': `203.0.113.9, ${ip}` } });

  it('begrenzt Anfragen pro Minute und IP-Adresse', async () => {
    let now = 0;
    const { raw } = setup({ rateLimitPerMinute: 3, trustProxy: true }, undefined, () => now);
    for (let i = 0; i < 3; i++) expect((await raw('/v1/info', fromIp('198.51.100.1'))).status).toBe(200);
    const blocked = await raw('/v1/info', fromIp('198.51.100.1'));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Andere Adresse ist nicht betroffen, nach einer Minute geht es wieder.
    expect((await raw('/v1/info', fromIp('198.51.100.2'))).status).toBe(200);
    now += 61_000;
    expect((await raw('/v1/info', fromIp('198.51.100.1'))).status).toBe(200);
  });

  it('begrenzt neue Konten pro Stunde und IP-Adresse', async () => {
    const { raw } = setup({ newAccountsPerHour: 2, trustProxy: true });
    const create = async () => {
      const id = createId();
      const token = (await deriveKeys(id, 'pw', 1000)).authToken;
      return raw('/v1/accounts', {
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.7', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncId: id }),
      });
    };
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(429);
  });

  it('vertraut X-Forwarded-For nur, wenn ein Reverse-Proxy eingestellt ist', async () => {
    const { raw } = setup({ rateLimitPerMinute: 1, trustProxy: false });
    expect((await raw('/v1/info', fromIp('198.51.100.1'))).status).toBe(200);
    // Gefälschte Adresse hilft nicht: Ohne Proxy-Einstellung zählt die echte Verbindung.
    expect((await raw('/v1/info', fromIp('198.51.100.99'))).status).toBe(429);
  });

  it('nimmt keine Konten mehr an, wenn der Server voll ist', async () => {
    const { client } = setup({ maxAccounts: 1 });
    await client.createAccount(syncId, keys.authToken);
    const other = createId();
    await expect(client.createAccount(other, (await deriveKeys(other, 'x', 1000)).authToken)).rejects.toMatchObject({ status: 403 });
  });

  it('meldet die Aufräum-Einstellung in /v1/info', async () => {
    const { client } = setup({ deleteInactiveAfterDays: 365 });
    expect(await client.getInfo()).toMatchObject({ deleteInactiveAfterDays: 365 });
  });
});

describe('Unbenutzte Konten', () => {
  it('werden nach der eingestellten Zeit gelöscht, benutzte bleiben', () => {
    const db = new Database(':memory:');
    db.createAccount('alt', 'h', 1_000);
    db.createAccount('neu', 'h', 1_000);
    db.touchAccount('neu', 50_000);
    expect(db.deleteInactiveAccounts(10_000)).toBe(1);
    expect(db.getAccount('alt')).toBeUndefined();
    expect(db.getAccount('neu')).toBeDefined();
  });
});

describe('Konfiguration', () => {
  it('liest Umgebungsvariablen und lehnt Unsinn ab', () => {
    expect(loadConfig({ TRUST_PROXY: 'ja', RATE_LIMIT_PER_MINUTE: '0' })).toMatchObject({ trustProxy: true, rateLimitPerMinute: 0 });
    expect(() => loadConfig({ PORT: 'abc' })).toThrow();
    expect(() => loadConfig({ TRUST_PROXY: 'vielleicht' })).toThrow();
  });
});
