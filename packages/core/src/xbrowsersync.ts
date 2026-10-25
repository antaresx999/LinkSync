/**
 * Umstieg von xBrowserSync: Lesezeichen aus einer xBrowserSync-Sicherungsdatei
 * oder direkt von einem xBrowserSync-Server übernehmen.
 */

import type { ImportNode, ImportRoots } from './backup';
import { utf8 } from './encoding';
import type { FetchFn } from './http-client';
import { lzutf8Decompress } from './lzutf8';
import type { RootId } from './model';

export const XBS_DEFAULT_SERVICE = 'https://api.xbrowsersync.org';
const XBS_KDF_ITERATIONS = 250_000;
const XBS_SEPARATOR_URL = 'xbs:separator';

/** Hauptordner in xBrowserSync. */
const XBS_CONTAINERS: Record<string, RootId> = {
  '[xbs] Toolbar': 'toolbar',
  '[xbs] Menu': 'menu',
  '[xbs] Other': 'other',
  '[xbs] Mobile': 'mobile',
};

export interface XbsBookmark {
  title?: string;
  url?: string;
  description?: string;
  tags?: string[];
  children?: XbsBookmark[];
}

export type XbsErrorCode = 'invalidId' | 'unreachable' | 'notFound' | 'serverError' | 'legacy' | 'wrongPassword' | 'corrupt';

export class XbsError extends Error {
  constructor(
    readonly code: XbsErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'XbsError';
  }
}

/** Erkennt eine xBrowserSync-Sicherungsdatei (alle Versionen) und gibt deren Lesezeichen zurück. */
export function parseXbsBackup(data: unknown): XbsBookmark[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as { xbrowsersync?: { data?: { bookmarks?: unknown } }; xBrowserSync?: { bookmarks?: unknown } };
  const bookmarks = d.xbrowsersync?.data?.bookmarks ?? d.xBrowserSync?.bookmarks;
  if (d.xbrowsersync === undefined && d.xBrowserSync === undefined) return null;
  return Array.isArray(bookmarks) ? (bookmarks as XbsBookmark[]) : [];
}

/** xBrowserSync-Lesezeichen in LinkSync-Hauptordner einsortieren. */
export function xbsToImportRoots(bookmarks: XbsBookmark[]): ImportRoots {
  const roots: ImportRoots = {};
  const push = (root: RootId, nodes: ImportNode[]) => (roots[root] = [...(roots[root] ?? []), ...nodes]);
  for (const item of bookmarks) {
    const container = item.title ? XBS_CONTAINERS[item.title] : undefined;
    if (container && item.url === undefined) push(container, convert(item.children ?? []));
    else push('other', convert([item]));
  }
  return roots;
}

function convert(items: XbsBookmark[], depth = 0): ImportNode[] {
  if (depth > 100) return [];
  const result: ImportNode[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    if (item.url === XBS_SEPARATOR_URL) continue; // Trennlinien gibt es in LinkSync nicht
    const title = typeof item.title === 'string' ? item.title : '';
    if (typeof item.url === 'string') result.push({ title, url: item.url });
    else result.push({ title, children: convert(item.children ?? [], depth + 1) });
  }
  return result;
}

/** Verschlüsselte Lesezeichen von xBrowserSync (ab Version 1.5) entschlüsseln. */
export async function decryptXbsBookmarks(syncId: string, password: string, encrypted: string): Promise<XbsBookmark[]> {
  const passwordKey = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: utf8(syncId), iterations: XBS_KDF_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  } catch (err) {
    throw new XbsError('corrupt', 'Die Daten von xBrowserSync sind beschädigt.', err);
  }
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 16) }, key, bytes.slice(16));
  } catch (err) {
    throw new XbsError('wrongPassword', 'Sync-ID oder Passwort für xBrowserSync falsch.', err);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(lzutf8Decompress(new Uint8Array(decrypted)));
  } catch (err) {
    throw new XbsError('corrupt', 'Die Daten von xBrowserSync sind beschädigt.', err);
  }
  if (!Array.isArray(parsed)) throw new XbsError('corrupt', 'Unerwartetes Datenformat von xBrowserSync.');
  return parsed as XbsBookmark[];
}

/** Lesezeichen direkt von einem xBrowserSync-Server holen und entschlüsseln. */
export async function fetchXbsBookmarks(
  serviceUrl: string,
  syncId: string,
  password: string,
  fetchFn: FetchFn = (input, init) => fetch(input, init),
): Promise<XbsBookmark[]> {
  const id = syncId.trim().replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/i.test(id)) throw new XbsError('invalidId', 'Eine xBrowserSync-ID besteht aus 32 Zeichen (0–9, a–f).');
  const url = `${serviceUrl.trim().replace(/\/+$/, '')}/bookmarks/${id}`;

  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (err) {
    throw new XbsError('unreachable', `xBrowserSync-Server ${serviceUrl} nicht erreichbar.`, err);
  }
  if (response.status === 401 || response.status === 404) throw new XbsError('notFound', 'Diese Sync-ID gibt es auf dem xBrowserSync-Server nicht.');
  if (!response.ok) throw new XbsError('serverError', `xBrowserSync-Server meldet Fehler ${response.status}.`);

  const data = (await response.json()) as { bookmarks?: string; version?: string };
  if (!data.bookmarks) return [];
  if (!data.version) {
    throw new XbsError(
      'legacy',
      'Diese Daten stammen von xBrowserSync vor Version 1.5. Bitte dort zuerst eine Sicherungsdatei erstellen und diese importieren.',
    );
  }
  return decryptXbsBookmarks(id, password, data.bookmarks);
}
