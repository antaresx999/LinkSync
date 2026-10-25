/**
 * Der Sync-Dienst der Erweiterung. Läuft im Hintergrund und erledigt:
 *  - Konto anlegen oder mit bestehendem Konto verbinden
 *  - Sync-Durchgänge (Browser → LinkSync → Server → Browser)
 *  - Speichern des Zustands zwischen den Durchgängen
 *
 * Alles, was mit dem echten Browser zu tun hat, wird von aussen übergeben.
 * So lässt sich der Dienst mit dem simulierten Browser testen.
 */

import {
  AuthError,
  BookmarkTree,
  Clock,
  createId,
  createNodeId,
  deriveKeys,
  emptySyncState,
  KDF_ITERATIONS,
  NetworkError,
  PROTOCOL_VERSION,
  ServerError,
  SyncEngine,
  type ClockState,
  type ItemRecord,
  type LinkSyncClient,
  type SyncState,
} from '@linksync/core';
import type { BookmarksApi, BrowserNode } from './bookmarks-api';
import { applyToBrowser, captureLocalChanges } from './bridge';
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

export interface ExtensionStorage {
  loadState(): Promise<StoredState | undefined>;
  saveState(state: StoredState): Promise<void>;
  clearState(): Promise<void>;
  loadKey(): Promise<CryptoKey | undefined>;
  saveKey(key: CryptoKey): Promise<void>;
  clearKey(): Promise<void>;
  /** Sicherung der Browser-Lesezeichen, bevor sie ersetzt werden. */
  saveBackup(tree: BrowserNode[]): Promise<void>;
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
    };

export interface ServiceOptions {
  bookmarks: BookmarksApi;
  storage: ExtensionStorage;
  clientFactory: ClientFactory;
  /** Nur für Tests kleiner. */
  kdfIterations?: number;
  now?: () => number;
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
    return {
      configured: true,
      syncId: state.syncId,
      serverUrl: state.serverUrl,
      syncing: this.syncing,
      lastSyncAt: state.lastSyncAt,
      lastError: state.lastError,
      bookmarkCount: state.records.filter((r) => !r.fields.deleted && r.fields.kind === 'bookmark').length,
    };
  }

  /** Neues Konto anlegen und die Lesezeichen dieses Browsers hochladen. */
  createAccount(serverUrl: string, password: string): Promise<Status> {
    return this.exclusive(async () => {
      const url = normalizeUrl(serverUrl);
      const client = this.options.clientFactory(url);
      await this.checkServer(client);
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
      await this.checkServer(client);
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

  // ---------- Intern ----------

  private async runSync(): Promise<void> {
    const { storage, bookmarks } = this.options;
    const state = await storage.loadState();
    const key = await storage.loadKey();
    if (!state) return;
    if (!key) {
      state.lastError = 'Schlüssel fehlt. Bitte die Verbindung trennen und neu verbinden.';
      await storage.saveState(state);
      return;
    }

    const clock = new Clock(state.nodeId, state.clock, this.options.now);
    const tree = new BookmarkTree(clock, state.records, state.dirty);
    const map = new IdMap(state.map);
    const client = this.options.clientFactory(state.serverUrl);
    const engine = new SyncEngine(tree, key, client.transport(state.syncId, state.authToken), state.syncState);

    this.syncing = true;
    try {
      if (state.pending !== 'replace') await captureLocalChanges(bookmarks, tree, map);
      await friendly(state.serverUrl, () => engine.sync());
      this.applying = true;
      const result = await applyToBrowser(bookmarks, tree, map, { removeUnknown: state.pending === 'replace' });
      state.pending = null;
      state.lastSyncAt = (this.options.now ?? Date.now)();
      state.lastError = result.errors.length
        ? `${result.errors.length} Lesezeichen konnten in diesem Browser nicht angelegt werden.`
        : null;
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

  private async checkServer(client: ReturnType<ClientFactory>): Promise<void> {
    const info = await friendly('', () => client.getInfo());
    if (info.protocol !== PROTOCOL_VERSION) {
      throw new Error(`Der Server spricht Protokoll ${info.protocol}, diese Erweiterung ${PROTOCOL_VERSION}.`);
    }
  }

  /** Immer nur eine Aktion gleichzeitig. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
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
  if (!/^https?:\/\/[^\s/]+/.test(trimmed)) throw new Error('Bitte eine gültige Server-Adresse eingeben, z. B. https://sync.example.com');
  return trimmed;
}

/** Technische Fehler in verständliche Meldungen übersetzen. */
async function friendly<T>(serverUrl: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof AuthError) throw new Error('Sync-ID oder Passwort falsch.');
    if (err instanceof NetworkError) {
      throw new Error(serverUrl ? `Server ${serverUrl} nicht erreichbar.` : 'Server nicht erreichbar.');
    }
    if (err instanceof ServerError) throw new Error(`Server meldet: ${err.message}`);
    throw err;
  }
}
