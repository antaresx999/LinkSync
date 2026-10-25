/** Nachrichten zwischen Popup und Hintergrunddienst. */

import { browser } from 'wxt/browser';
import type { Status } from './service';

export type Request =
  | { type: 'status' }
  | { type: 'create'; serverUrl: string; password: string }
  | { type: 'connect'; serverUrl: string; syncId: string; password: string }
  | { type: 'sync' }
  | { type: 'disconnect' };

export type Response = { ok: true; status: Status } | { ok: false; error: string };

/** Vom Popup aus aufrufen. Wirft bei Fehlern einen Error mit verständlicher Meldung. */
export async function send(request: Request): Promise<Status> {
  const response = (await browser.runtime.sendMessage(request)) as Response | undefined;
  if (!response) throw new Error('Keine Antwort vom Hintergrunddienst.');
  if (!response.ok) throw new Error(response.error);
  return response.status;
}
