/**
 * Der Sync-Ablauf eines Geräts.
 *
 *   1. Neue Einträge vom Server abholen, entschlüsseln, zusammenführen.
 *   2. Lokale Änderungen verschlüsseln und hochladen.
 *   3. Bei Konflikten: zurück zu 1 (höchstens ein paar Runden).
 */

import { decryptRecord, encryptRecord } from './crypto';
import { MAX_PUSH_RECORDS, type SyncTransport } from './protocol';
import type { ItemRecord } from './model';
import type { BookmarkTree } from './tree';

const MAX_ROUNDS = 5;

/** Was sich das Gerät über den Server-Stand merken muss. */
export interface SyncState {
  /** Bis zu dieser seq wurde alles abgeholt. */
  lastSeq: number;
  /** Letzte bekannte seq je Eintrag. */
  seqs: Record<string, number>;
}

export interface SyncResult {
  /** Anzahl Einträge, die vom Server kamen und lokal etwas geändert haben. */
  received: number;
  /** Anzahl hochgeladener Einträge. */
  sent: number;
  /** Einträge, die nicht entschlüsselt werden konnten (sollte nie vorkommen). */
  failed: string[];
}

export class SyncConflictError extends Error {
  constructor() {
    super('Sync nicht abgeschlossen: zu viele Konflikte hintereinander. Bitte später erneut versuchen.');
    this.name = 'SyncConflictError';
  }
}

export function emptySyncState(): SyncState {
  return { lastSeq: 0, seqs: {} };
}

export class SyncEngine {
  constructor(
    private readonly tree: BookmarkTree,
    private readonly key: CryptoKey,
    private readonly transport: SyncTransport,
    private state: SyncState = emptySyncState(),
  ) {}

  getState(): SyncState {
    return { lastSeq: this.state.lastSeq, seqs: { ...this.state.seqs } };
  }

  async sync(): Promise<SyncResult> {
    const result: SyncResult = { received: 0, sent: 0, failed: [] };

    for (let round = 0; round < MAX_ROUNDS; round++) {
      await this.pullAll(result);

      const dirty = this.tree.getDirty();
      if (dirty.length === 0) return result;

      let hadConflict = false;
      for (let i = 0; i < dirty.length; i += MAX_PUSH_RECORDS) {
        const batch = dirty.slice(i, i + MAX_PUSH_RECORDS);
        hadConflict = (await this.pushBatch(batch, result)) || hadConflict;
      }
      if (!hadConflict) return result;
    }
    throw new SyncConflictError();
  }

  private async pullAll(result: SyncResult): Promise<void> {
    let hasMore = true;
    while (hasMore) {
      const response = await this.transport.pull(this.state.lastSeq);
      for (const encrypted of response.records) {
        // Eigene, schon bekannte Fassung: nichts zu tun.
        if (this.state.seqs[encrypted.id] === encrypted.seq) continue;
        let record: ItemRecord;
        try {
          record = await decryptRecord(this.key, encrypted.id, encrypted.data);
        } catch {
          result.failed.push(encrypted.id);
          continue;
        }
        this.state.seqs[encrypted.id] = encrypted.seq;
        if (this.tree.applyRemote(record)) result.received++;
      }
      this.state.lastSeq = Math.max(this.state.lastSeq, response.seq);
      hasMore = response.hasMore && response.records.length > 0;
    }
  }

  /** Gibt true zurück, wenn es Konflikte gab. */
  private async pushBatch(batch: ItemRecord[], result: SyncResult): Promise<boolean> {
    const records = await Promise.all(
      batch.map(async (r) => ({
        id: r.id,
        baseSeq: this.state.seqs[r.id] ?? 0,
        data: await encryptRecord(this.key, r),
      })),
    );
    const response = await this.transport.push({ records });
    const sentById = new Map(batch.map((r) => [r.id, r]));
    for (const { id, seq } of response.accepted) {
      const sent = sentById.get(id);
      if (!sent) continue;
      this.state.seqs[id] = seq;
      this.tree.markClean(sent);
      result.sent++;
    }
    return response.conflicts.length > 0;
  }
}
