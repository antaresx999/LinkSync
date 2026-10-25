/**
 * Das Sync-Protokoll zwischen Gerät und Server (Version 1).
 *
 * Der Server speichert pro Sync-Konto eine Liste verschlüsselter Einträge.
 * Jedes Mal, wenn ein Eintrag gespeichert wird, zählt der Server eine
 * fortlaufende Nummer ("seq") hoch und vermerkt sie am Eintrag.
 *
 *  - Abholen (pull): "Gib mir alle Einträge mit seq grösser als X."
 *  - Hochladen (push): Das Gerät schickt geänderte Einträge mit der seq, die
 *    es zuletzt gesehen hat ("baseSeq"). Hat sich der Eintrag auf dem Server
 *    seither geändert, lehnt der Server ihn ab (Konflikt). Das Gerät holt
 *    dann die neue Fassung ab, führt zusammen und versucht es nochmal.
 *
 * Der Server sieht nur IDs, Nummern und verschlüsselte Daten.
 *
 * HTTP-Schnittstelle (Anmeldung per "Authorization: Bearer <authToken>"):
 *   POST /v1/accounts                { syncId, authTokenHash } → 201
 *   GET  /v1/accounts/:syncId/records?since=<seq>&limit=<n>  → PullResponse
 *   POST /v1/accounts/:syncId/records  PushRequest           → PushResponse
 *   DELETE /v1/accounts/:syncId                              → 204
 */

export const PROTOCOL_VERSION = 1;

/** Höchstens so viele Einträge pro Hochladen. */
export const MAX_PUSH_RECORDS = 500;
/** Höchstens so viele Zeichen verschlüsselte Daten pro Eintrag. */
export const MAX_RECORD_DATA_LENGTH = 16_384;

export interface EncryptedRecord {
  id: string;
  seq: number;
  data: string;
}

export interface PullResponse {
  records: EncryptedRecord[];
  /** Höchste seq in dieser Antwort (oder "since", wenn leer). Beim nächsten Abholen als "since" verwenden. */
  seq: number;
  /** true, wenn noch mehr Einträge warten. */
  hasMore: boolean;
}

export interface PushRecord {
  id: string;
  /** seq, die das Gerät zuletzt von diesem Eintrag kannte (0 = neu). */
  baseSeq: number;
  data: string;
}

export interface PushRequest {
  records: PushRecord[];
}

export interface PushResponse {
  /** Gespeicherte Einträge mit ihrer neuen seq. */
  accepted: { id: string; seq: number }[];
  /** IDs, die abgelehnt wurden, weil der Server eine neuere Fassung hat. */
  conflicts: string[];
}

/** So spricht das Gerät mit dem Server. Für Tests gibt es MemoryServer. */
export interface SyncTransport {
  pull(since: number): Promise<PullResponse>;
  push(request: PushRequest): Promise<PushResponse>;
}
