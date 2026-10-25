import { describe, expect, it } from 'vitest';
import { AuthError, MemoryServer, type SyncTransport } from '@linksync/core';
import type { BrowserNode } from './bookmarks-api';
import { FakeBookmarks } from './fake-bookmarks';
import { setLanguage } from './i18n';
import { SyncService, type ClientFactory, type ExtensionStorage, type StoredState } from './service';

/** Speicher im Arbeitsspeicher statt browser.storage / IndexedDB. */
function memoryStorage() {
  let state: StoredState | undefined;
  let key: CryptoKey | undefined;
  const backups: { createdAt: number; tree: BrowserNode[] }[] = [];
  const storage: ExtensionStorage = {
    loadState: async () => (state ? structuredClone(state) : undefined),
    saveState: async (s) => void (state = structuredClone(s)),
    clearState: async () => void (state = undefined),
    loadKey: async () => key,
    saveKey: async (k) => void (key = k),
    clearKey: async () => void (key = undefined),
    saveBackup: async (tree) => void backups.push({ createdAt: 1, tree: structuredClone(tree) }),
    loadBackup: async () => backups.at(-1),
  };
  return { storage, backups };
}

/** Test-Server mit Konten: prüft das Anmelde-Token wie der echte Server. */
function fakeServer() {
  const accounts = new Map<string, { token: string; server: MemoryServer }>();
  const factory: ClientFactory = () => ({
    getInfo: async () => ({ name: 'LinkSync', version: 'test', protocol: 1, allowNewAccounts: true, maxRecordsPerAccount: 1e6, message: '' }),
    createAccount: async (syncId, token) => void accounts.set(syncId, { token, server: new MemoryServer() }),
    deleteAccount: async (syncId, token) => {
      if (accounts.get(syncId)?.token !== token) throw new AuthError();
      accounts.delete(syncId);
    },
    transport: (syncId, token): SyncTransport => {
      const check = () => {
        const account = accounts.get(syncId);
        if (!account || account.token !== token) throw new AuthError();
        return account.server;
      };
      return { pull: async (since) => check().pull(since), push: async (req) => check().push(req) };
    },
  });
  return factory;
}

function makeService(factory: ClientFactory) {
  const bookmarks = new FakeBookmarks('chrome');
  const { storage, backups } = memoryStorage();
  const service = new SyncService({ bookmarks, storage, clientFactory: factory, kdfIterations: 1000 });
  return { bookmarks, service, backups };
}

setLanguage('de');

describe('SyncService', () => {
  it('legt ein Konto an, lädt hoch und ein zweiter Browser verbindet sich', async () => {
    const factory = fakeServer();
    const a = makeService(factory);
    await a.bookmarks.create({ parentId: '1', title: 'LinkSync', url: 'https://github.com/antaresx999/LinkSync' });
    const status = await a.service.createAccount('http://localhost:8080/', 'geheim');
    expect(status).toMatchObject({ configured: true, serverUrl: 'http://localhost:8080', lastError: null, bookmarkCount: 1 });

    const b = makeService(factory);
    await b.bookmarks.create({ parentId: '1', title: 'Wird ersetzt', url: 'https://alt' });
    const syncId = status.configured ? status.syncId : '';
    await b.service.connect('http://localhost:8080', syncId, 'geheim');
    expect(b.bookmarks.outline('1')).toEqual(['LinkSync']);
    expect(b.backups).toHaveLength(1);

    await b.bookmarks.create({ parentId: '2', title: 'Von B', url: 'https://b' });
    await b.service.sync();
    await a.service.sync();
    expect(a.bookmarks.outline('2')).toEqual(['Von B']);
  });

  it('meldet ein falsches Passwort verständlich und richtet nichts ein', async () => {
    const factory = fakeServer();
    const a = makeService(factory);
    const status = await a.service.createAccount('http://localhost:8080', 'richtig');
    const b = makeService(factory);
    await b.bookmarks.create({ parentId: '1', title: 'Bleibt', url: 'https://bleibt' });
    const syncId = status.configured ? status.syncId : '';
    await expect(b.service.connect('http://localhost:8080', syncId, 'falsch')).rejects.toThrow('Sync-ID oder Passwort falsch.');
    expect(await b.service.status()).toEqual({ configured: false });
    expect(b.bookmarks.outline('1')).toEqual(['Bleibt']);
  });

  it('lehnt ungültige Server-Adressen ab', async () => {
    const a = makeService(fakeServer());
    await expect(a.service.createAccount('kein server', 'pw')).rejects.toThrow('gültige Server-Adresse');
  });

  it('merkt sich Fehler im Status und lässt die Lesezeichen in Ruhe', async () => {
    let online = true;
    const base = fakeServer();
    const flaky: ClientFactory = (url) => {
      const client = base(url);
      return {
        ...client,
        transport: (id, token, size) => {
          const t = client.transport(id, token, size);
          return {
            pull: async (since) => {
              if (!online) throw new Error('offline');
              return t.pull(since);
            },
            push: t.push,
          };
        },
      };
    };
    const a = makeService(flaky);
    await a.service.createAccount('http://localhost:8080', 'pw');
    await a.bookmarks.create({ parentId: '1', title: 'Offline angelegt', url: 'https://offline' });
    online = false;
    await expect(a.service.sync()).rejects.toThrow('offline');
    expect(await a.service.status()).toMatchObject({ lastError: 'offline' });
    expect(a.bookmarks.outline('1')).toEqual(['Offline angelegt']);

    online = true;
    await a.service.sync();
    expect(await a.service.status()).toMatchObject({ lastError: null, bookmarkCount: 1 });
  });

  it('löscht das Konto auf dem Server; andere Browser können danach nicht mehr synchronisieren', async () => {
    const factory = fakeServer();
    const a = makeService(factory);
    await a.bookmarks.create({ parentId: '1', title: 'Bleibt lokal', url: 'https://bleibt' });
    const status = await a.service.createAccount('http://localhost:8080', 'pw');
    const b = makeService(factory);
    await b.service.connect('http://localhost:8080', status.configured ? status.syncId : '', 'pw');

    expect(await a.service.deleteAccount()).toEqual({ configured: false });
    expect(a.bookmarks.outline('1')).toEqual(['Bleibt lokal']);
    await expect(b.service.sync()).rejects.toThrow('Sync-ID oder Passwort falsch.');
  });

  it('trennt die Verbindung, ohne Lesezeichen zu löschen', async () => {
    const a = makeService(fakeServer());
    await a.bookmarks.create({ parentId: '1', title: 'Bleibt', url: 'https://bleibt' });
    await a.service.createAccount('http://localhost:8080', 'pw');
    await a.service.disconnect();
    expect(await a.service.status()).toEqual({ configured: false });
    expect(a.bookmarks.outline('1')).toEqual(['Bleibt']);
  });
});

describe('SyncService – Suche, Sicherung, Import', () => {
  async function ready() {
    const factory = fakeServer();
    const a = makeService(factory);
    const news = await a.bookmarks.create({ parentId: '1', title: 'News' });
    await a.bookmarks.create({ parentId: news.id, title: 'Neue Zürcher Zeitung', url: 'https://www.nzz.ch' });
    await a.bookmarks.create({ parentId: '1', title: 'Heise online', url: 'https://www.heise.de' });
    await a.bookmarks.create({ parentId: '2', title: 'Zeitplan', url: 'https://example.com/news' });
    const status = await a.service.createAccount('http://localhost:8080', 'pw');
    return { factory, a, syncId: status.configured ? status.syncId : '' };
  }

  it('findet Lesezeichen über Titel und Adresse, beste Treffer zuerst', async () => {
    const { a } = await ready();
    const results = await a.service.search('zeit');
    expect(results.map((r) => r.title)).toEqual(['Zeitplan', 'Neue Zürcher Zeitung']);
    expect(results[1]!.path).toEqual(['News']);
    expect((await a.service.search('heise de')).map((r) => r.title)).toEqual(['Heise online']);
    expect(await a.service.search('   ')).toEqual([]);
  });

  it('exportiert eine Sicherung und spielt sie auf einem anderen Gerät ein', async () => {
    const { a, factory, syncId } = await ready();
    const backup = await a.service.exportBackup();
    expect(backup.format).toBe('linksync-backup');

    // Alles löschen …
    for (const id of ['News', 'Heise online']) await a.bookmarks.removeTree(a.bookmarks.findByTitle(id));
    await a.service.sync();
    expect(a.bookmarks.outline('1')).toEqual([]);

    // … und auf Gerät B wiederherstellen.
    const b = makeService(factory);
    await b.service.connect('http://localhost:8080', syncId, 'pw');
    const { result } = await b.service.importRoots(backup.roots, true);
    expect(result).toMatchObject({ bookmarks: 3, folders: 1 });
    expect(b.bookmarks.outline('1')).toEqual(['News/', ['Neue Zürcher Zeitung'], 'Heise online']);

    await a.service.sync();
    expect(a.bookmarks.outline('1')).toEqual(['News/', ['Neue Zürcher Zeitung'], 'Heise online']);
  });

  it('übernimmt beim Verbinden ersetzte Lesezeichen auf Wunsch zusätzlich', async () => {
    const { factory, syncId } = await ready();
    const b = makeService(factory);
    await b.bookmarks.create({ parentId: '1', title: 'Nur auf B', url: 'https://nur-b.example' });
    await b.bookmarks.create({ parentId: '1', title: 'Heise doppelt', url: 'https://www.heise.de' });
    const status = await b.service.connect('http://localhost:8080', syncId, 'pw');
    expect(status).toMatchObject({ connectBackupAt: 1 });
    expect(b.bookmarks.outline('1')).not.toContain('Nur auf B');

    const { result } = await b.service.restoreConnectBackup();
    expect(result).toEqual({ bookmarks: 1, folders: 0, skipped: 1 });
    expect(b.bookmarks.outline('1')).toContain('Nur auf B');
  });

  it('meldet xBrowserSync-Fehler verständlich', async () => {
    const { factory } = await ready();
    const b = makeService(factory);
    const notFound = new SyncService({
      bookmarks: b.bookmarks,
      storage: memoryStorage().storage,
      clientFactory: factory,
      fetchFn: async () => new Response('{}', { status: 404 }),
    });
    await expect(notFound.importFromXbs('https://xbs.example', '0123456789abcdef0123456789abcdef', 'pw', false)).rejects.toThrow(
      'gibt es auf dem xBrowserSync-Server nicht',
    );
  });
});
