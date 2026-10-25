import { beforeAll, describe, expect, it } from 'vitest';
import { Clock } from './clock';
import { deriveKeys } from './crypto';
import { MemoryServer } from './memory-server';
import { BookmarkTree } from './tree';
import { SyncEngine } from './sync';

let key: CryptoKey;
beforeAll(async () => {
  key = (await deriveKeys('sync-test', 'passwort', 1000)).encryptionKey;
});

/** Gemeinsame, künstliche Uhrzeit, damit die Tests die Reihenfolge steuern können. */
let now = 1_000_000;
const later = () => (now += 1000);

function device(server: MemoryServer, nodeId: string, pageSize?: number) {
  const tree = new BookmarkTree(new Clock(nodeId, undefined, () => now));
  const engine = new SyncEngine(tree, key, server.transport(pageSize));
  return { tree, engine, sync: () => engine.sync() };
}

describe('Sync zwischen zwei Geräten', () => {
  it('überträgt neue Lesezeichen', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    const b = device(server, 'b');
    const folder = a.tree.addFolder('toolbar', 'News');
    a.tree.addBookmark(folder, 'Heise', 'https://heise.de');
    await a.sync();
    await b.sync();
    expect(b.tree.toTree()).toEqual(a.tree.toTree());
  });

  it('behält gleichzeitige Änderungen an verschiedenen Feldern', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    const b = device(server, 'b');
    const bm = a.tree.addBookmark('toolbar', 'Alt', 'https://example.com');
    await a.sync();
    await b.sync();

    later();
    a.tree.update(bm, { title: 'Neuer Titel' }); // A ändert den Titel …
    b.tree.move(bm, 'menu'); // … B verschiebt gleichzeitig.
    await a.sync();
    await b.sync(); // B bekommt beim Hochladen einen Konflikt, führt zusammen, lädt erneut hoch.
    await a.sync();

    for (const d of [a, b]) {
      expect(d.tree.children('menu')).toMatchObject([{ title: 'Neuer Titel' }]);
      expect(d.tree.children('toolbar')).toEqual([]);
    }
  });

  it('nimmt beim selben Feld die neuere Änderung', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    const b = device(server, 'b');
    const bm = a.tree.addBookmark('toolbar', 'Start', 'https://x');
    await a.sync();
    await b.sync();

    later();
    a.tree.update(bm, { title: 'Von A' });
    later();
    b.tree.update(bm, { title: 'Von B (neuer)' });
    await b.sync();
    await a.sync();
    await b.sync();

    expect(a.tree.get(bm)!.fields.title).toBe('Von B (neuer)');
    expect(b.tree.get(bm)!.fields.title).toBe('Von B (neuer)');
  });

  it('verliert nichts, wenn ein Gerät einen Ordner löscht und das andere etwas hineinlegt', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    const b = device(server, 'b');
    const folder = a.tree.addFolder('toolbar', 'Ordner');
    await a.sync();
    await b.sync();

    later();
    a.tree.remove(folder);
    b.tree.addBookmark(folder, 'Wichtig', 'https://wichtig');
    await a.sync();
    await b.sync();
    await a.sync();

    for (const d of [a, b]) {
      expect(d.tree.children('toolbar')).toEqual([]);
      expect(d.tree.children('other')).toMatchObject([{ title: 'Wichtig' }]);
    }
  });

  it('kommt bei gleichzeitigem Verschieben ineinander auf allen Geräten zum gleichen Baum', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    const b = device(server, 'b');
    const x = a.tree.addFolder('toolbar', 'X');
    const y = a.tree.addFolder('toolbar', 'Y');
    await a.sync();
    await b.sync();

    later();
    a.tree.move(x, y);
    b.tree.move(y, x);
    await a.sync();
    await b.sync();
    await a.sync();

    expect(a.tree.toTree()).toEqual(b.tree.toTree());
    expect(JSON.stringify(a.tree.toTree())).toContain('"X"');
    expect(JSON.stringify(a.tree.toTree())).toContain('"Y"');
  });

  it('überträgt auch sehr viele Lesezeichen (mehrere Pakete und Seiten)', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    const b = device(server, 'b', 100);
    for (let i = 0; i < 1200; i++) a.tree.addBookmark('other', `Lesezeichen ${i}`, `https://example.com/${i}`);
    const result = await a.sync();
    expect(result.sent).toBe(1200);
    await b.sync();
    expect(b.tree.children('other')).toHaveLength(1200);
    expect(b.tree.toTree()).toEqual(a.tree.toTree());
  });

  it('lädt nichts hoch, wenn nichts geändert wurde', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    a.tree.addBookmark('toolbar', 'X', 'https://x');
    await a.sync();
    expect(await a.sync()).toEqual({ received: 0, sent: 0, failed: [] });
  });

  it('speichert auf dem Server nur verschlüsselte Daten', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    a.tree.addBookmark('toolbar', 'Mein Geheimnis', 'https://geheim.example');
    await a.sync();
    const stored = JSON.stringify(server.dump());
    expect(stored).not.toContain('Geheimnis');
    expect(stored).not.toContain('geheim.example');
    expect(stored).not.toContain('toolbar');
  });

  it('meldet Einträge, die mit einem anderen Passwort verschlüsselt sind', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    a.tree.addBookmark('toolbar', 'X', 'https://x');
    await a.sync();
    const otherKey = (await deriveKeys('sync-test', 'anderes', 1000)).encryptionKey;
    const stranger = new SyncEngine(new BookmarkTree(new Clock('c')), otherKey, server.transport());
    const result = await stranger.sync();
    expect(result.failed).toHaveLength(1);
  });

  it('setzt nach einem Neustart mit gespeichertem Zustand fort', async () => {
    const server = new MemoryServer();
    const a = device(server, 'a');
    a.tree.addBookmark('toolbar', 'X', 'https://x');
    await a.sync();

    // Gerät A "neu starten": Einträge und Sync-Zustand aus dem Speicher laden.
    const restoredTree = new BookmarkTree(new Clock('a', undefined, () => now), a.tree.allRecords());
    const restored = new SyncEngine(restoredTree, key, server.transport(), a.engine.getState());
    expect(await restored.sync()).toEqual({ received: 0, sent: 0, failed: [] });
  });
});
