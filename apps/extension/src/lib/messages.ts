/** Nachrichten zwischen Popup/Einstellungsseite und Hintergrunddienst. */

import type { ImportResult, ImportRoots, LinkSyncBackup } from '@linksync/core';
import { browser } from 'wxt/browser';
import { t } from './i18n';
import type { SearchResult, Status } from './service';

export interface Requests {
  status: { request: { type: 'status' }; response: Status };
  create: { request: { type: 'create'; serverUrl: string; password: string }; response: Status };
  connect: { request: { type: 'connect'; serverUrl: string; syncId: string; password: string }; response: Status };
  sync: { request: { type: 'sync' }; response: Status };
  disconnect: { request: { type: 'disconnect' }; response: Status };
  search: { request: { type: 'search'; query: string }; response: SearchResult[] };
  exportBackup: { request: { type: 'exportBackup' }; response: LinkSyncBackup };
  import: { request: { type: 'import'; roots: ImportRoots; replace: boolean }; response: ImportResult };
  importXbs: {
    request: { type: 'importXbs'; serviceUrl: string; syncId: string; password: string; replace: boolean };
    response: ImportResult;
  };
  restoreConnectBackup: { request: { type: 'restoreConnectBackup' }; response: ImportResult };
}

export type Request = Requests[keyof Requests]['request'];
export type Reply = { ok: true; value: unknown } | { ok: false; error: string };

/** Vom Popup oder der Einstellungsseite aus aufrufen. Wirft bei Fehlern einen Error mit verständlicher Meldung. */
export async function send<K extends keyof Requests>(request: Requests[K]['request'] & { type: K }): Promise<Requests[K]['response']> {
  const reply = (await browser.runtime.sendMessage(request)) as Reply | undefined;
  if (!reply) throw new Error(t('errBackground'));
  if (!reply.ok) throw new Error(reply.error);
  return reply.value as Requests[K]['response'];
}
