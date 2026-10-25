/**
 * Speicher der Erweiterung im echten Browser.
 *  - Zustand (Einträge, Zuordnung …): browser.storage.local
 *  - Verschlüsselungsschlüssel: IndexedDB. Dort lässt er sich als nicht
 *    exportierbarer Schlüssel ablegen – auch Schadcode im Browser kann ihn
 *    dann nicht auslesen, nur benutzen.
 */

import { createStore, del, get, set } from 'idb-keyval';
import { browser } from 'wxt/browser';
import type { BrowserNode } from './bookmarks-api';
import type { ExtensionStorage, StoredState } from './service';

const STATE_KEY = 'linksync:state';
const BACKUP_KEY = 'linksync:backup';
const keyStore = createStore('linksync', 'keys');

export function browserStorage(): ExtensionStorage {
  return {
    async loadState() {
      const result = await browser.storage.local.get(STATE_KEY);
      return result[STATE_KEY] as StoredState | undefined;
    },
    async saveState(state) {
      await browser.storage.local.set({ [STATE_KEY]: state });
    },
    async clearState() {
      await browser.storage.local.remove(STATE_KEY);
    },
    loadKey: () => get<CryptoKey>('encryptionKey', keyStore),
    saveKey: (key) => set('encryptionKey', key, keyStore),
    clearKey: () => del('encryptionKey', keyStore),
    async saveBackup(tree: BrowserNode[]) {
      await browser.storage.local.set({ [BACKUP_KEY]: { createdAt: Date.now(), tree } });
    },
  };
}
