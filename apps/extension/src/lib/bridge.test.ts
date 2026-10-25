import { beforeAll, describe, expect, it } from 'vitest';
import { BookmarkTree, Clock, deriveKeys, MemoryServer, SyncEngine } from '@linksync/core';
import { applyToBrowser, captureLocalChanges } from './bridge';
import { FakeBookmarks, type Flavor } from './fake-bookmarks';
import { IdMap } from './id-map';

let key: CryptoKey;
beforeAll(async () => {
  key = (await deriveKeys('bridge-test', 'pw', 1000)).encryptionKey;
});

let now = 1_000_000;

/** Ein Gerät = simulierter Browser + LinkSync-Baum + Zuordnung + Sync. */
function device(server: MemoryServer, flavor: Flavor, name: string) {
  const browser = new FakeBookmarks(flavor);
  const tree = new BookmarkTree(new Clock(name, undefined, () => now));
  const map = new IdMap();
  const engine = new SyncEngine(tree, key, server.transport());
  return {
    browser,
    tree,
    map,
    /** Ein kompletter Sync-Durchgang wie in der Erweiterung. */
    async sync(options: { replace?: boolean } = {}) {
      if (!options.replace) await captureLocalChanges(browser, tree, map);
      await engine.sync();
      return applyToBrowser(browser, tree, map, { removeUnknown: options.replace });
    },
  };
}

async function fill(b: FakeBookmarks) {
  const { toolbar, other } = b.rootIds;
  await b.create({ parentId: toolbar, title: 'Heise', url: 'https://heise.de' });
  const news = await b.create({ parentId: toolbar, title: 'News' });
  await b.create({ parentId: news.id, title: 'NZZ', url: 'https://nzz.ch' });
  await b.create({ parentId: news.id, title: 'SRF', url: 'https://srf.ch' });
  await b.create({ parentId: other, title: 'Wikipedia', url: 'https://wikipedia.org' });
}

describe('Abgleich Browser ↔ LinkSync', () => {
  it('überträgt alle Lesezeichen auf ein zweites Gerät', async () => {
    const server = new MemoryServer();
    const a = device(server, 'chrome', 'a');
    const b = device(server, 'chrome', 'b');
    await fill(a.browser);
    await a.sync();
    await b.sync({ replace: true });
    expect(b.browser.outline('1')).toEqual(a.browser.outline('1'));
    expect(b.browser.outline('1')).toEqual(['Heise', 'News/', ['NZZ', 'SRF']]);
    expect(b.browser.outline('2')).toEqual(['Wikipedia']);
  });

  it('verändert beim zweiten Durchgang nichts, wenn nichts passiert ist', async () => {
    const server = new MemoryServer();
    const a = device(server, 'chrome', 'a');
    await fill(a.browser);
    await a.sync();
    const logLength = a.browser.log.length;
    const dirtyBefore = a.tree.dirtyIds().length;
    await a.sync();
    expect(a.browser.log.length).toBe(logLength);
    expect(dirtyBefore).toBe(0);
    expect(a.tree.dirtyIds()).toEqual([]);
  });

  it('übernimmt Umbenennen, Verschieben, Löschen und Neues in beide Richtungen', async () => {
    const server = new MemoryServer();
    const a = device(server, 'chrome', 'a');
    const b = device(server, 'chrome', 'b');
    await fill(a.browser);
    await a.sync();
    await b.sync({ replace: true });

    now += 1000;
    const ab = a.browser;
    await ab.update(ab.findByTitle('Heise'), { title: 'Heise online' });
    await ab.move(ab.findByTitle('SRF'), { parentId: '1', index: 0 });
    await ab.remove(ab.findByTitle('Wikipedia'));
    await ab.create({ parentId: ab.findByTitle('News'), title: 'Tagesanzeiger', url: 'https://tagesanzeiger.ch' });
    await a.sync();
    await b.sync();

    expect(b.browser.outline('1')).toEqual(['SRF', 'Heise online', 'News/', ['NZZ', 'Tagesanzeiger']]);
    expect(b.browser.outline('2')).toEqual([]);

    // Und zurück: B ordnet um, A übernimmt.
    now += 1000;
    await b.browser.move(b.browser.findByTitle('News'), { parentId: '1', index: 0 });
    await b.sync();
    await a.sync();
    expect(a.browser.outline('1')).toEqual(['News/', ['NZZ', 'Tagesanzeiger'], 'SRF', 'Heise online']);
  });

  it('führt gleichzeitige Änderungen auf zwei Geräten zusammen', async () => {
    const server = new MemoryServer();
    const a = device(server, 'chrome', 'a');
    const b = device(server, 'chrome', 'b');
    await fill(a.browser);
    await a.sync();
    await b.sync({ replace: true });

    now += 1000;
    await a.browser.create({ parentId: '1', title: 'Von A', url: 'https://a.example' });
    await b.browser.create({ parentId: '2', title: 'Von B', url: 'https://b.example' });
    await b.browser.update(b.browser.findByTitle('NZZ'), { title: 'NZZ (B)' });
    await a.sync();
    await b.sync();
    await a.sync();

    for (const d of [a, b]) {
      expect(d.browser.outline('1')).toEqual(['Heise', 'News/', ['NZZ (B)', 'SRF'], 'Von A']);
      expect(d.browser.outline('2')).toEqual(['Wikipedia', 'Von B']);
    }
  });

  it('ersetzt beim Verbinden die vorhandenen Lesezeichen', async () => {
    const server = new MemoryServer();
    const a = device(server, 'chrome', 'a');
    const b = device(server, 'chrome', 'b');
    await fill(a.browser);
    await a.sync();
    await b.browser.create({ parentId: '1', title: 'Alt auf B', url: 'https://alt' });
    await b.sync({ replace: true });
    expect(b.browser.outline('1')).toEqual(['Heise', 'News/', ['NZZ', 'SRF']]);
  });

  it('erkennt Änderungen, die gemacht wurden, während die Erweiterung aus war', async () => {
    const server = new MemoryServer();
    const a = device(server, 'chrome', 'a');
    await fill(a.browser);
    await a.sync();
    // "Offline" ändern: einfach direkt im Browser, ohne Ereignisse.
    await a.browser.removeTree(a.browser.findByTitle('News'));
    await a.sync();
    const b = device(server, 'chrome', 'b');
    await b.sync({ replace: true });
    expect(b.browser.outline('1')).toEqual(['Heise']);
  });
});

describe('Zwischen Chrome und Firefox', () => {
  it('ordnet die Hauptordner richtig zu', async () => {
    const server = new MemoryServer();
    const chrome = device(server, 'chrome', 'c');
    const firefox = device(server, 'firefox', 'f');
    await fill(chrome.browser);
    await chrome.sync();
    await firefox.sync({ replace: true });
    expect(firefox.browser.outline('toolbar_____')).toEqual(['Heise', 'News/', ['NZZ', 'SRF']]);
    expect(firefox.browser.outline('unfiled_____')).toEqual(['Wikipedia']);
  });

  it('behält Firefox-Lesezeichen im Menü, auch wenn Chrome kein Menü hat', async () => {
    const server = new MemoryServer();
    const firefox = device(server, 'firefox', 'f');
    const chrome = device(server, 'chrome', 'c');
    await firefox.browser.create({ parentId: 'menu________', title: 'Im Menü', url: 'https://menu.example' });
    await firefox.browser.create({ parentId: 'toolbar_____', title: 'In der Leiste', url: 'https://bar.example' });
    await firefox.sync();
    await chrome.sync({ replace: true });
    expect(chrome.browser.outline('1')).toEqual(['In der Leiste']);

    // Chrome synchronisiert weiter, das Menü-Lesezeichen bleibt erhalten.
    now += 1000;
    await chrome.browser.create({ parentId: '1', title: 'Von Chrome', url: 'https://chrome.example' });
    await chrome.sync();
    await firefox.sync();
    expect(firefox.browser.outline('menu________')).toEqual(['Im Menü']);
    expect(firefox.browser.outline('toolbar_____')).toEqual(['In der Leiste', 'Von Chrome']);
  });

  it('lässt Trennlinien und Firefox-Abfragen in Ruhe', async () => {
    const server = new MemoryServer();
    const firefox = device(server, 'firefox', 'f');
    await firefox.browser.create({ parentId: 'toolbar_____', title: 'A', url: 'https://a' });
    firefox.browser.addSeparator('toolbar_____');
    await firefox.browser.create({ parentId: 'toolbar_____', title: 'Meistbesucht', url: 'place:sort=8' });
    await firefox.sync();
    await firefox.sync();
    expect(firefox.browser.outline('toolbar_____')).toEqual(['A', '---', 'Meistbesucht']);
    expect(firefox.tree.childIds('toolbar')).toHaveLength(1);
  });

  it('meldet Lesezeichen, die ein Browser nicht anlegen kann, statt abzubrechen', async () => {
    const server = new MemoryServer();
    const a = device(server, 'chrome', 'a');
    const b = device(server, 'chrome', 'b');
    a.tree.addBookmark('toolbar', 'Kaputt', 'keine-url');
    a.tree.addBookmark('toolbar', 'Gut', 'https://gut');
    await a.sync();
    const result = await b.sync({ replace: true });
    expect(result.errors).toHaveLength(1);
    expect(b.browser.outline('1')).toContain('Gut');
  });
});

describe('Viele Lesezeichen', () => {
  it('importiert und überträgt 3000 Lesezeichen in vernünftiger Zeit', async () => {
    const server = new MemoryServer();
    const a = device(server, 'chrome', 'a');
    const b = device(server, 'chrome', 'b');
    for (let f = 0; f < 30; f++) {
      const folder = await a.browser.create({ parentId: '1', title: `Ordner ${f}` });
      for (let i = 0; i < 100; i++) {
        await a.browser.create({ parentId: folder.id, title: `LZ ${f}-${i}`, url: `https://example.com/${f}/${i}` });
      }
    }
    const started = Date.now();
    await a.sync();
    await b.sync({ replace: true });
    const elapsed = Date.now() - started;
    expect(b.browser.outline('1')).toEqual(a.browser.outline('1'));
    expect(elapsed).toBeLessThan(10_000);
  }, 30_000);
});
