import lzutf8 from 'lzutf8';
import { describe, expect, it } from 'vitest';
import { utf8 } from './encoding';
import { lzutf8Decompress } from './lzutf8';
import { decryptXbsBookmarks, fetchXbsBookmarks, parseXbsBackup, xbsToImportRoots, type XbsBookmark } from './xbrowsersync';

/** Verschlüsselt genau so, wie es xBrowserSync tut (zum Testen der Gegenrichtung). */
async function xbsEncrypt(syncId: string, password: string, bookmarks: XbsBookmark[]): Promise<string> {
  const passwordKey = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: utf8(syncId), iterations: 250_000, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const compressed = lzutf8.compress(JSON.stringify(bookmarks)) as Uint8Array<ArrayBuffer>;
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed));
  const combined = new Uint8Array(16 + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, 16);
  return btoa(String.fromCharCode(...combined));
}

const sample: XbsBookmark[] = [
  {
    title: '[xbs] Toolbar',
    children: [
      { title: 'Heise', url: 'https://heise.de', description: 'News', tags: ['it'] },
      { title: '', url: 'xbs:separator' },
      { title: 'Ordner', children: [{ title: 'Zürich – Grüezi 👋', url: 'https://zh.ch' }] },
    ],
  },
  { title: '[xbs] Menu', children: [{ title: 'Im Menü', url: 'https://menu.example' }] },
  { title: '[xbs] Other', children: [{ title: 'Weitere', url: 'https://other.example' }] },
];

describe('LZUTF8 entpacken', () => {
  const cases = [
    '',
    'Hallo',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'Grüezi – Zürich ✓ 👋 日本語 '.repeat(50),
    JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ title: `Lesezeichen ${i}`, url: `https://example.com/${i % 37}` }))),
  ];
  for (const text of cases) {
    it(`entpackt korrekt (${text.length} Zeichen)`, () => {
      expect(lzutf8Decompress(lzutf8.compress(text) as Uint8Array)).toBe(text);
    });
  }
});

describe('xBrowserSync-Sicherungsdatei', () => {
  it('erkennt das aktuelle und das alte Format', () => {
    expect(parseXbsBackup({ xbrowsersync: { date: 'x', sync: {}, data: { bookmarks: sample } } })).toEqual(sample);
    expect(parseXbsBackup({ xBrowserSync: { bookmarks: sample } })).toEqual(sample);
    expect(parseXbsBackup({ format: 'linksync-backup' })).toBeNull();
  });

  it('ordnet Hauptordner zu und lässt Trennlinien weg', () => {
    expect(xbsToImportRoots(sample)).toEqual({
      toolbar: [
        { title: 'Heise', url: 'https://heise.de' },
        { title: 'Ordner', children: [{ title: 'Zürich – Grüezi 👋', url: 'https://zh.ch' }] },
      ],
      menu: [{ title: 'Im Menü', url: 'https://menu.example' }],
      other: [{ title: 'Weitere', url: 'https://other.example' }],
    });
  });

  it('legt Lesezeichen ausserhalb der Hauptordner unter "Weitere" ab', () => {
    expect(xbsToImportRoots([{ title: 'Lose', url: 'https://lose' }])).toEqual({ other: [{ title: 'Lose', url: 'https://lose' }] });
  });
});

describe('xBrowserSync-Server', () => {
  const syncId = '0123456789abcdef0123456789abcdef';

  it('entschlüsselt Daten im xBrowserSync-Format', async () => {
    const encrypted = await xbsEncrypt(syncId, 'passwort', sample);
    expect(await decryptXbsBookmarks(syncId, 'passwort', encrypted)).toEqual(sample);
  });

  it('meldet ein falsches Passwort', async () => {
    const encrypted = await xbsEncrypt(syncId, 'passwort', sample);
    await expect(decryptXbsBookmarks(syncId, 'falsch', encrypted)).rejects.toThrow('Passwort für xBrowserSync falsch');
  });

  it('holt Lesezeichen vom Server (auch mit Bindestrichen in der ID)', async () => {
    const encrypted = await xbsEncrypt(syncId, 'passwort', sample);
    const requested: string[] = [];
    const fakeFetch = async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify({ bookmarks: encrypted, version: '1.6.0', lastUpdated: '2022-01-01' }));
    };
    const result = await fetchXbsBookmarks('https://xbs.example/', '01234567-89ab-cdef-0123-456789abcdef', 'passwort', fakeFetch);
    expect(result).toEqual(sample);
    expect(requested).toEqual([`https://xbs.example/bookmarks/${syncId}`]);
  });

  it('meldet verständlich, wenn die Sync-ID nicht existiert oder alt ist', async () => {
    const notFound = async () => new Response('{}', { status: 404 });
    await expect(fetchXbsBookmarks('https://x', syncId, 'pw', notFound)).rejects.toThrow('gibt es auf dem xBrowserSync-Server nicht');
    const legacy = async () => new Response(JSON.stringify({ bookmarks: 'abc', lastUpdated: 'x' }));
    await expect(fetchXbsBookmarks('https://x', syncId, 'pw', legacy)).rejects.toThrow('vor Version 1.5');
    await expect(fetchXbsBookmarks('https://x', 'kurz', 'pw', notFound)).rejects.toThrow('32 Zeichen');
  });
});
