/**
 * Ende-zu-Ende-Test im echten Firefox.
 *
 * Startet zwei getrennte Firefox-Instanzen mit der gebauten Erweiterung und
 * lässt sie über einen laufenden LinkSync-Server synchronisieren.
 *
 * Voraussetzung: Server läuft (`pnpm server`). Der Test baut die Erweiterung selbst.
 *   pnpm --filter @linksync/extension e2e:firefox
 */

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import lzutf8 from 'lzutf8';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const FIREFOX = process.env.FIREFOX_PATH ?? '/Applications/Firefox.app/Contents/MacOS/firefox';
const EXTENSION_ID = 'linksync@antaresx999.github.io';
const UUID = '6c1f6a2e-0d1b-4c5e-9a57-1b2c3d4e5f60';
const POPUP = `moz-extension://${UUID}/popup.html`;
const PASSWORD = 'ein-langes-test-passwort';
const SERVER = process.env.LINKSYNC_SERVER ?? 'http://localhost:8080';
const shots = resolve(import.meta.dirname, 'screenshots');
mkdirSync(shots, { recursive: true });

async function launch(): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: FIREFOX,
    headless: process.env.HEADLESS !== 'false',
    // Erlaubt dem Test, Erweiterungsseiten zu bedienen.
    args: ['--remote-allow-system-access'],
    extraPrefsFirefox: { 'extensions.webextensions.uuids': JSON.stringify({ [EXTENSION_ID]: UUID }) },
  });
  await browser.installExtension(resolve(import.meta.dirname, '../.output/firefox-mv3-e2e'));
  // Der Test-Build öffnet sein Popup nach der Installation selbst als Tab.
  for (let attempt = 0; attempt < 50; attempt++) {
    for (const page of await browser.pages()) {
      const href = await page.evaluate(() => location.href).catch(() => '');
      if (href.startsWith(POPUP)) {
        // tsx fügt beim Übersetzen "__name(...)" in Funktionen ein – im Browser bereitstellen.
        await page.evaluate('globalThis.__name = (fn) => fn');
        await page.waitForSelector('main');
        return { browser, page };
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Popup der Erweiterung wurde nicht gefunden');
}

/** Lesezeichen-Schnittstelle des Browsers direkt aus der Erweiterungsseite aufrufen. */
const outline = (page: Page, rootId: string) =>
  page.evaluate(async (id) => {
    type Node = { title: string; type?: string; children?: Node[] };
    const walk = (nodes: Node[]): unknown[] =>
      nodes.flatMap((n) => (n.type === 'folder' ? [`${n.title}/`, walk(n.children ?? [])] : [n.title]));
    const [root] = await browser.bookmarks.getSubTree(id);
    return walk(root?.children ?? []);
  }, rootId);

const addBookmark = (page: Page, parentId: string, title: string, url?: string) =>
  page.evaluate((p, t, u) => browser.bookmarks.create({ parentId: p, title: t, url: u }).then((n) => n.id), parentId, title, url);

/** Feld befüllen wie beim Tippen (löst das "input"-Ereignis aus, auf das Svelte hört). */
const fill = (page: Page, selector: string, value: string, nth = 0) =>
  page.evaluate(
    (sel, v, n) => {
      const el = document.querySelectorAll<HTMLInputElement>(sel)[n];
      if (!el) throw new Error(`Feld nicht gefunden: ${sel}`);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    selector,
    value,
    nth,
  );

const click = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`Element nicht gefunden: ${sel}`);
    el.click();
  }, selector);

/** Bildschirmfoto – falls Firefox es für Erweiterungsseiten erlaubt. */
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${shots}/${name}.png` }).catch(() => undefined);

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) {
    console.log('  erwartet:', JSON.stringify(expected));
    console.log('  erhalten:', JSON.stringify(actual));
    process.exitCode = 1;
  }
}

/** "Jetzt synchronisieren" klicken und warten, bis der Sync fertig ist. */
async function syncNow(page: Page) {
  const before = await page.$eval('main', (m) => m.dataset.lastSync ?? '');
  await click(page, 'section.status button.primary');
  await page.waitForFunction((b) => {
    const main = document.querySelector('main')!;
    return main.dataset.lastSync !== b && main.getAttribute('aria-busy') === 'false';
  }, { timeout: 20_000 }, before);
}

/** Nachgebauter xBrowserSync-Server: liefert Lesezeichen genau so verschlüsselt aus wie das Original. */
async function startFakeXbs(syncId: string, password: string, bookmarks: unknown) {
  const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(syncId), iterations: 250_000, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const data = lzutf8.compress(JSON.stringify(bookmarks)) as Uint8Array<ArrayBuffer>;
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const payload = JSON.stringify({ bookmarks: Buffer.concat([iv, encrypted]).toString('base64'), version: '1.6.0', lastUpdated: new Date().toISOString() });
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === `/bookmarks/${syncId}`) res.end(payload);
    else res.writeHead(404).end('{}');
  });
  await new Promise<void>((r) => server.listen(8091, '127.0.0.1', r));
  return server;
}

execSync('pnpm wxt build -b firefox --mv3', {
  cwd: resolve(import.meta.dirname, '..'),
  env: { ...process.env, WXT_E2E: '1' },
  stdio: 'ignore',
});

const XBS_ID = '0123456789abcdef0123456789abcdef';
const xbs = await startFakeXbs(XBS_ID, 'xbs-passwort', [
  { title: '[xbs] Toolbar', children: [{ title: 'Aus xBrowserSync', url: 'https://xbs.example/', tags: ['alt'] }] },
  { title: '[xbs] Other', children: [{ title: 'XBS-Ordner', children: [{ title: 'Grüezi', url: 'https://gruezi.example/' }] }] },
]);

const a = await launch();
const b = await launch();
try {
  // --- Server auch über die Netzwerk-IP erreichbar (nicht nur localhost) ---
  // Firefox würde ohne eigene Sicherheitsrichtlinie http:// auf https:// umschreiben.
  const lanIp = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  if (lanIp) {
    const lanUrl = SERVER.replace(/localhost|127\.0\.0\.1/, lanIp);
    const status = await a.page.evaluate(async (u) => (await fetch(`${u}/v1/info`).catch(() => null))?.status ?? 0, lanUrl);
    check(`Server über Netzwerk-IP erreichbar (${lanUrl})`, status, 200);
  }

  // --- Firefox A: Lesezeichen anlegen, Konto erstellen ---
  await addBookmark(a.page, 'toolbar_____', 'Heise', 'https://www.heise.de/');
  const news = await addBookmark(a.page, 'toolbar_____', 'News');
  await addBookmark(a.page, news, 'NZZ', 'https://www.nzz.ch/');
  await addBookmark(a.page, 'menu________', 'Im Menü', 'https://example.com/menu');

  // Kein voreingestellter Server: Adresse eintragen (ohne http:// würde https:// ergänzt).
  await fill(a.page, 'input[name="server"]', SERVER);
  await fill(a.page, 'input[type="password"]', PASSWORD, 0);
  await fill(a.page, 'input[type="password"]', PASSWORD, 1);
  await click(a.page, 'button[type="submit"]');
  await a.page.waitForSelector('.dot.ok', { timeout: 20_000 });
  const syncId = await a.page.$eval('.syncid span', (el) => el.textContent ?? '');
  console.log(`✓ Firefox A: Konto angelegt, Sync-ID ${syncId}`);

  // --- Firefox B: hat eigene Lesezeichen, verbindet sich mit dem Konto ---
  await addBookmark(b.page, 'toolbar_____', 'Wird ersetzt', 'https://alt.example/');
  await click(b.page, '[role="tab"]:nth-child(2)');
  await b.page.waitForSelector('input[placeholder^="xxxx"]');
  await fill(b.page, 'input[name="server"]', SERVER);
  await fill(b.page, 'input[placeholder^="xxxx"]', syncId);
  await fill(b.page, 'input[type="password"]', PASSWORD);
  await click(b.page, 'button[type="submit"]');
  await b.page.waitForSelector('.dot.ok', { timeout: 20_000 });

  check('Firefox B hat die Symbolleiste von A', await outline(b.page, 'toolbar_____'), ['Heise', 'News/', ['NZZ']]);
  // Das Menü enthält auch den Ordner "Mozilla Firefox", den jedes neue Firefox-Profil mitbringt.
  check('Firefox B hat das Menü von A', await outline(b.page, 'menu________'), await outline(a.page, 'menu________'));

  // --- Änderung auf B, Sync auf beiden, A hat die Änderung ---
  const bNews = await b.page.evaluate(async () => (await browser.bookmarks.search({ title: 'News' }))[0]!.id);
  await addBookmark(b.page, bNews, 'SRF', 'https://www.srf.ch/');
  await b.page.evaluate(async () => {
    const [heise] = await browser.bookmarks.search({ title: 'Heise' });
    await browser.bookmarks.update(heise!.id, { title: 'Heise online' });
  });
  await syncNow(b.page);
  await syncNow(a.page);
  check('Firefox A hat die Änderungen von B', await outline(a.page, 'toolbar_____'), ['Heise online', 'News/', ['NZZ', 'SRF']]);

  // --- Automatischer Sync nach einer Änderung (ohne Klick) ---
  await addBookmark(a.page, 'unfiled_____', 'Automatisch', 'https://auto.example/');
  await new Promise((r) => setTimeout(r, 5000)); // 3 s warten auf Ruhe + Sync
  await syncNow(b.page);
  check('Automatischer Sync nach Änderung', await outline(b.page, 'unfiled_____'), ['Automatisch']);

  // --- Suche im Popup ---
  await fill(a.page, 'input.search', 'srf');
  await a.page.waitForSelector('.results a', { timeout: 5000 });
  check('Suche findet "SRF" mit Ordnerpfad', await a.page.$eval('.results a', (el) => el.innerText.split('\n')), ['SRF', 'News › www.srf.ch']);
  await fill(a.page, 'input.search', '');

  // --- Von xBrowserSync übernehmen (Einstellungsseite) ---
  await a.page.evaluate((url) => void (location.href = url), `moz-extension://${UUID}/options.html`);
  await a.page.waitForSelector('form input[placeholder^="0123"]', { timeout: 10_000 });
  await fill(a.page, 'form input[type="url"]', 'http://127.0.0.1:8091');
  await fill(a.page, 'form input[placeholder^="0123"]', XBS_ID);
  await fill(a.page, 'form input[type="password"]', 'xbs-passwort');
  await click(a.page, 'form button[type="submit"]');
  await a.page.waitForSelector('.success, .error', { timeout: 30_000 });
  const xbsMessage = await a.page.$eval('.success, .error', (el) => `${el.className}: ${(el as HTMLElement).innerText}`);
  check('xBrowserSync-Übernahme gemeldet', xbsMessage.startsWith('success'), true);
  console.log(`  ${xbsMessage}`);

  await syncNow(b.page);
  check('Firefox B hat die xBrowserSync-Lesezeichen', await outline(b.page, 'toolbar_____'), [
    'Heise online',
    'News/',
    ['NZZ', 'SRF'],
    'Aus xBrowserSync',
  ]);
  check('… auch in Unterordnern', await outline(b.page, 'unfiled_____'), ['Automatisch', 'XBS-Ordner/', ['Grüezi']]);
} finally {
  await a.browser.close();
  await b.browser.close();
  xbs.close();
}
console.log(process.exitCode ? '\nFehler gefunden.' : '\nAlles in Ordnung.');
