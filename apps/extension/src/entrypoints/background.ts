/**
 * Hintergrunddienst der Erweiterung.
 *
 * Synchronisiert, wenn
 *  - sich Lesezeichen im Browser ändern (nach 3 Sekunden Ruhe),
 *  - der Browser startet,
 *  - alle 10 Minuten (um Änderungen anderer Geräte abzuholen),
 *  - im Popup auf "Jetzt synchronisieren" geklickt wird.
 */

import { LinkSyncClient } from '@linksync/core';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { BookmarksApi } from '../lib/bookmarks-api';
import { browserStorage } from '../lib/browser-storage';
import type { Reply, Request } from '../lib/messages';
import { SyncService, type Status } from '../lib/service';

const ALARM = 'linksync-sync';
const DEBOUNCE_MS = 3000;

export default defineBackground(() => {
  const service = new SyncService({
    bookmarks: browser.bookmarks as unknown as BookmarksApi,
    storage: browserStorage(),
    clientFactory: (url) => new LinkSyncClient(url),
  });

  const syncInBackground = () => {
    service
      .sync()
      .then(updateBadge, async (err) => {
        console.warn('LinkSync: Sync fehlgeschlagen', err);
        updateBadge(await service.status());
      });
  };

  // Lesezeichen geändert → kurz warten (es kommen oft mehrere Änderungen auf einmal), dann synchronisieren.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onBookmarkChange = () => {
    if (service.applying) return; // Änderungen, die LinkSync selbst gemacht hat
    clearTimeout(timer);
    timer = setTimeout(syncInBackground, DEBOUNCE_MS);
  };
  browser.bookmarks.onCreated.addListener(onBookmarkChange);
  browser.bookmarks.onChanged.addListener(onBookmarkChange);
  browser.bookmarks.onMoved.addListener(onBookmarkChange);
  browser.bookmarks.onRemoved.addListener(onBookmarkChange);
  browser.bookmarks.onChildrenReordered?.addListener(onBookmarkChange);

  browser.runtime.onStartup.addListener(syncInBackground);

  // Nur im automatischen Test-Build: Popup als Tab öffnen, damit der Test es bedienen kann.
  if (import.meta.env.WXT_E2E === '1') {
    browser.runtime.onInstalled.addListener(() => void browser.tabs.create({ url: browser.runtime.getURL('/popup.html') }));
  }
  void browser.alarms.get(ALARM).then((existing) => {
    if (!existing) void browser.alarms.create(ALARM, { periodInMinutes: 10 });
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) syncInBackground();
  });

  // Anfragen vom Popup.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handle(message as Request)
      .then(
        (value): Reply => ({ ok: true, value }),
        (err): Reply => ({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      )
      .then(async (reply) => {
        updateBadge(await service.status());
        sendResponse(reply);
      });
    return true; // Antwort kommt später
  });

  async function handle(request: Request): Promise<unknown> {
    switch (request.type) {
      case 'status':
        return service.status();
      case 'create':
        return service.createAccount(request.serverUrl, request.password);
      case 'connect':
        return service.connect(request.serverUrl, request.syncId, request.password);
      case 'sync':
        return service.sync();
      case 'disconnect':
        return service.disconnect();
      case 'deleteAccount':
        return service.deleteAccount();
      case 'search':
        return service.search(request.query);
      case 'exportBackup':
        return service.exportBackup();
      case 'import':
        return (await service.importRoots(request.roots, request.replace)).result;
      case 'importXbs':
        return (await service.importFromXbs(request.serviceUrl, request.syncId, request.password, request.replace)).result;
      case 'restoreConnectBackup':
        return (await service.restoreConnectBackup()).result;
    }
  }

  /** Rotes "!" am Symbol, wenn der letzte Sync fehlgeschlagen ist. */
  function updateBadge(status: Status) {
    const error = status.configured && status.lastError;
    void browser.action.setBadgeText({ text: error ? '!' : '' });
    if (error) void browser.action.setBadgeBackgroundColor({ color: '#d93025' });
  }
});
