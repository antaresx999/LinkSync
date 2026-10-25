/**
 * Der Sync-Dienst der Erweiterung. Läuft im Hintergrund und erledigt:
 *  - Konto anlegen oder mit bestehendem Konto verbinden
 *  - Sync-Durchgänge (Browser → LinkSync → Server → Browser)
 *  - Suche, Sicherung und Import
 *  - Speichern des Zustands zwischen den Durchgängen
 *
 * Alles, was mit dem echten Browser zu tun hat, wird von aussen übergeben.
 * So lässt sich der Dienst mit dem simulierten Browser testen.
 */

import {
  AuthError,
  BookmarkTree,
  Clock,
  createBackup,
  createId,
  createNodeId,
  deriveKeys,
  emptySyncState,
  fetchXbsBookmarks,
  importIntoTree,
  isRootId,
  KDF_ITERATIONS,
  NetworkError,
  PROTOCOL_VERSION,
  ServerError,
  SyncEngine,
  XbsError,
  xbsToImportRoots,
  type ClockState,
  type FetchFn,
  type ImportNode,
  type ImportResult,
  type ImportRoots,
  type ItemRecord,
  type LinkSyncBackup,
  type LinkSyncClient,
  type SyncState,
} from '@linksync/core';
import { detectRoots, isFolder, isSyncable, type BookmarksApi, type BrowserNode } from './bookmarks-api';
import { applyToBrowser, captureLocalChanges } from './bridge';
import { t, type MessageKey } from './i18n';
import { IdMap } from './id-map';

export interface StoredState {
  version: 1;
  serverUrl: string;
  syncId: string;
  nodeId: string;
  authToken: string;
  clock: ClockState;
  records: ItemRecord[];
  dirty: string[];
  syncState: SyncState;
  map: [string, string][];
  /** Was beim nächsten Durchgang einmalig passieren soll. */
  pending: 'import' | 'replace' | null;
  lastSyncAt: number | null;
  lastError: string | null;
}

export interface BrowserBackup {
  createdAt: number;
  tree: BrowserNode[];
}

export interface ExtensionStorage {
  loadState(): Promise<StoredState | undefined>;
  saveState(state: StoredState): Promise<void>;
  clearState(): Promise<void>;
  loadKey(): Promise<CryptoKey | undefined>;
  saveKey(key: CryptoKey): Promise<void>;
  clearKey(): Promise<void>;
  /** Sicherung der Browser-Lesezeichen, bevor sie beim Verbinden ersetzt werden. */
  saveBackup(tree: BrowserNode[]): Promise<void>;
  loadBackup(): Promise<BrowserBackup | undefined>;
}

export type ClientFactory = (serverUrl: string) => Pick<LinkSyncClient, 'getInfo' | 'createAccount' | 'transport'>;

export type Status =
  | { configured: false }
  | {
      configured: true;
      syncId: string;
      serverUrl: string;
      syncing: boolean;
      lastSyncAt: number | null;
      lastError: string | null;
      bookmarkCount: number;
      /** Zeitpunkt der Sicherung vor dem Verbinden, falls vorhanden. */
      connectBackupAt: number | null;
    };

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  /** Ordnerpfad, z. B. "Lesezeichenleiste › News". */
  path: string[];
}

export interface ServiceOptions {
  bookmarks: BookmarksApi;
  storage: ExtensionStorage;
  clientFactory: ClientFactory;
  /** Für den Abruf von xBrowserSync. Standard: fetch */
  fetchFn?: FetchFn;
  /** Nur für Tests kleiner. */
  kdfIterations?: number;
  now?: () => number;
}

/** Fehler mit übersetzter Meldung. */
export class UserError extends Error {
  constructor(key: MessageKey, params: Record<string, string | number> = {}) {
    super(t(key, params));
    this.name = 'UserError';
  }
}

export class SyncService {
  private queue: Promise<unknown> = Promise.resolve();
  private syncing = false;
  /** true, während der Dienst selbst Lesezeichen im Browser ändert. */
  applying = false;

  constructor(private readonly options: ServiceOptions) {}

  async status(): Promise<Status> {
    const state = await this.options.storage.loadState();
    if (!state) return { configured: false };
    const backup = await this.options.storage.loadBackup();
    return {
      configured: true,
      syncId: state.syncId,
      serverUrl: state.serverUrl,
      syncing: this.syncing,
      lastSyncAt: state.lastSyncAt,
      lastError: state.lastError,
      bookmarkCount: state.records.filter((r) => !r.fields.deleted && r.fields.kind === 'bookmark').length,
      connectBackupAt: backup?.createdAt ?? null,
    };
  }

  /** Neues Konto anlegen und die Lesezeichen dieses Browsers hochladen. */
  createAccount(serverUrl: string, password: string): Promise<Status> {
    return this.exclusive(async () => {
      const url = normalizeUrl(serverUrl);
      const client = this.options.clientFactory(url);
      await this.checkServer(client, url);
      const syncId = createId();
      const keys = await deriveKeys(syncId, password, this.options.kdfIterations ?? KDF_ITERATIONS);
      await friendly(url, () => client.createAccount(syncId, keys.authToken));
      await this.options.storage.saveKey(keys.encryptionKey);
      await this.options.storage.saveState(newState(url, syncId, keys.authToken, 'import'));
      await this.runSync();
      return this.status();
    });
  }

  /** Mit bestehendem Konto verbinden. Die Lesezeichen dieses Browsers werden ersetzt. */
  connect(serverUrl: string, syncId: string, password: string): Promise<Status> {
    return this.exclusive(async () => {
      const url = normalizeUrl(serverUrl);
      const id = syncId.trim().toLowerCase();
      const client = this.options.clientFactory(url);
      await this.checkServer(client, url);
      const keys = await deriveKeys(id, password, this.options.kdfIterations ?? KDF_ITERATIONS);
      // Prüfen, ob Sync-ID und Passwort stimmen (ein Eintrag reicht).
      await friendly(url, () => client.transport(id, keys.authToken, 1).pull(0));
      await this.options.storage.saveBackup(await this.options.bookmarks.getTree());
      await this.options.storage.saveKey(keys.encryptionKey);
      await this.options.storage.saveState(newState(url, id, keys.authToken, 'replace'));
      await this.runSync();
      return this.status();
    });
  }

  /** Verbindung trennen. Die Lesezeichen im Browser bleiben, wie sie sind. */
  disconnect(): Promise<Status> {
    return this.exclusive(async () => {
      await this.options.storage.clearState();
      await this.options.storage.clearKey();
      return this.status();
    });
  }

  /** Sync-Durchgang, falls ein Konto eingerichtet ist. Fehler landen im Status. */
  sync(): Promise<Status> {
    return this.exclusive(async () => {
      if (await this.options.storage.loadState()) await this.runSync();
      return this.status();
    });
  }

  // ---------- Suche ----------

  /** Lesezeichen suchen. Alle Wörter müssen in Titel oder Adresse vorkommen. */
  async search(query: string, limit = 30): Promise<SearchResult[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const tree = await this.loadTree();
    if (!tree) return [];

    const results: (SearchResult & { score: number })[] = [];
    for (const record of tree.allRecords()) {
      const { kind, title, url } = record.fields;
      if (kind !== 'bookmark' || !url || !tree.exists(record.id)) continue;
      const titleLower = title.toLowerCase();
      const haystack = `${titleLower} ${url.toLowerCase()}`;
      if (!words.every((w) => haystack.includes(w))) continue;
      // Treffer im Titel zählen mehr als in der Adresse, Treffer am Wortanfang am meisten.
      const score = words.reduce(
        (s, w) => s + (titleLower.startsWith(w) ? 3 : titleLower.includes(` ${w}`) ? 2 : titleLower.includes(w) ? 1 : 0),
        0,
      );
      results.push({ id: record.id, title, url, path: pathOf(tree, record.id), score });
    }
    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return results.slice(0, limit).map(({ score: _score, ...r }) => r);
  }

  // ---------- Sicherung und Import ----------

  async exportBackup(): Promise<LinkSyncBackup> {
    const tree = await this.loadTree();
    if (!tree) throw new UserError('errNotConfigured');
    return createBackup(tree, new Date((this.options.now ?? Date.now)()));
  }

  /** Lesezeichen übernehmen und sofort synchronisieren. */
  importRoots(roots: ImportRoots, replace: boolean): Promise<{ status: Status; result: ImportResult }> {
    return this.exclusive(async () => {
      if (!(await this.options.storage.loadState())) throw new UserError('errNotConfigured');
      let result: ImportResult = { bookmarks: 0, folders: 0, skipped: 0 };
      await this.runSync((tree) => {
        result = importIntoTree(tree, roots, { replace });
      });
      return { status: await this.status(), result };
    });
  }

  /** Lesezeichen direkt von einem xBrowserSync-Server übernehmen. */
  async importFromXbs(serviceUrl: string, syncId: string, password: string, replace: boolean) {
    let bookmarks;
    try {
      bookmarks = await fetchXbsBookmarks(serviceUrl, syncId, password, this.options.fetchFn);
    } catch (err) {
      if (err instanceof XbsError) throw new UserError(`xbs_${err.code}`);
      throw err;
    }
    return this.importRoots(xbsToImportRoots(bookmarks), replace);
  }

  /** Die beim Verbinden ersetzten Lesezeichen zusätzlich übernehmen. */
  async restoreConnectBackup() {
    const backup = await this.options.storage.loadBackup();
    if (!backup) throw new UserError('errNoBackup');
    return this.importRoots(browserTreeToImportRoots(backup.tree), false);
  }

  // ---------- Intern ----------

  private async loadTree(): Promise<BookmarkTree | undefined> {
    const state = await this.options.storage.loadState();
    if (!state) return undefined;
    return new BookmarkTree(new Clock(state.nodeId, state.clock), state.records, state.dirty);
  }

  /** Ein Sync-Durchgang. "change" wird nach dem Erfassen der Browser-Änderungen auf den Baum angewendet. */
  private async runSync(change?: (tree: BookmarkTree) => void): Promise<void> {
    const { storage, bookmarks } = this.options;
    const state = await storage.loadState();
    const key = await storage.loadKey();
    if (!state) return;
    if (!key) {
      state.lastError = t('errKeyMissing');
      await storage.saveState(state);
      throw new UserError('errKeyMissing');
    }

    const clock = new Clock(state.nodeId, state.clock, this.options.now);
    const tree = new BookmarkTree(clock, state.records, state.dirty);
    const map = new IdMap(state.map);
    const client = this.options.clientFactory(state.serverUrl);
    const engine = new SyncEngine(tree, key, client.transport(state.syncId, state.authToken), state.syncState);

    this.syncing = true;
    try {
      if (state.pending !== 'replace') await captureLocalChanges(bookmarks, tree, map);
      change?.(tree);
      await friendly(state.serverUrl, () => engine.sync());
      this.applying = true;
      const result = await applyToBrowser(bookmarks, tree, map, { removeUnknown: state.pending === 'replace' });
      state.pending = null;
      state.lastSyncAt = (this.options.now ?? Date.now)();
      state.lastError = result.errors.length ? t('errNotCreated', { n: result.errors.length }) : null;
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.applying = false;
      this.syncing = false;
      state.clock = clock.getState();
      state.records = tree.allRecords();
      state.dirty = tree.dirtyIds();
      state.syncState = engine.getState();
      state.map = map.entries();
      await storage.saveState(state);
    }
  }

  private async checkServer(client: ReturnType<ClientFactory>, url: string): Promise<void> {
    const info = await friendly(url, () => client.getInfo());
    if (info.protocol !== PROTOCOL_VERSION) {
      throw new UserError('errProtocol', { server: info.protocol, client: PROTOCOL_VERSION });
    }
  }

  /** Immer nur eine Aktion gleichzeitig. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Browser-Lesezeichen (z. B. aus der Sicherung vor dem Verbinden) in Import-Form bringen. */
export function browserTreeToImportRoots(tree: BrowserNode[]): ImportRoots {
  const convert = (nodes: BrowserNode[]): ImportNode[] =>
    nodes.filter(isSyncable).map((n) =>
      isFolder(n) ? { title: n.title, children: convert(n.children ?? []) } : { title: n.title, url: n.url ?? '' },
    );
  const roots: ImportRoots = {};
  const index = new Map<string, BrowserNode>();
  for (const top of tree[0]?.children ?? []) index.set(top.id, top);
  for (const [root, browserId] of detectRoots(tree)) roots[root] = convert(index.get(browserId)?.children ?? []);
  return roots;
}

function pathOf(tree: BookmarkTree, id: string): string[] {
  const path: string[] = [];
  let parent = tree.parentOf(id);
  while (parent !== undefined && !isRootId(parent)) {
    path.unshift(tree.get(parent)?.fields.title ?? '');
    parent = tree.parentOf(parent);
  }
  return path;
}

function newState(serverUrl: string, syncId: string, authToken: string, pending: StoredState['pending']): StoredState {
  return {
    version: 1,
    serverUrl,
    syncId,
    nodeId: createNodeId(),
    authToken,
    clock: { ms: 0, counter: 0 },
    records: [],
    dirty: [],
    syncState: emptySyncState(),
    map: [],
    pending,
    lastSyncAt: null,
    lastError: null,
  };
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(trimmed)) throw new UserError('errInvalidServer');
  return trimmed;
}

/** Technische Fehler in verständliche Meldungen übersetzen. */
async function friendly<T>(serverUrl: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof AuthError) throw new UserError('errAuth');
    if (err instanceof NetworkError) throw new UserError('errUnreachable', { url: serverUrl });
    if (err instanceof ServerError) throw new UserError('errServer', { message: err.message });
    throw err;
  }
}
