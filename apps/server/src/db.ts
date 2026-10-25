/**
 * Datenbank des Servers (SQLite, in Node.js eingebaut).
 *
 * Zwei Tabellen:
 *   accounts – ein Eintrag pro Sync-Konto mit dem Hash des Anmelde-Tokens
 *   records  – die verschlüsselten Einträge aller Konten
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EncryptedRecord, PullResponse, PushRecord, PushResponse } from '@linksync/core';

export interface Account {
  syncId: string;
  authTokenHash: string;
  createdAt: number;
  lastSeq: number;
}

export class RecordLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Zu viele Einträge (höchstens ${limit} pro Konto)`);
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    sync_id         TEXT PRIMARY KEY,
    auth_token_hash TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    last_seq        INTEGER NOT NULL DEFAULT 0,
    last_used_at    INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS records (
    sync_id TEXT NOT NULL REFERENCES accounts(sync_id) ON DELETE CASCADE,
    id      TEXT NOT NULL,
    seq     INTEGER NOT NULL,
    data    TEXT NOT NULL,
    PRIMARY KEY (sync_id, id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS records_by_seq ON records (sync_id, seq);
`;

export class Database {
  private readonly db: DatabaseSync;

  /** path = ":memory:" für eine Datenbank nur im Arbeitsspeicher (Tests). */
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // ---------- Konten ----------

  /** Gibt false zurück, wenn es die Sync-ID schon gibt. */
  createAccount(syncId: string, authTokenHash: string, now = Date.now()): boolean {
    const result = this.db
      .prepare(
        'INSERT OR IGNORE INTO accounts (sync_id, auth_token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?)',
      )
      .run(syncId, authTokenHash, now, now);
    return result.changes === 1;
  }

  getAccount(syncId: string): Account | undefined {
    const row = this.db
      .prepare('SELECT sync_id, auth_token_hash, created_at, last_seq FROM accounts WHERE sync_id = ?')
      .get(syncId) as { sync_id: string; auth_token_hash: string; created_at: number; last_seq: number } | undefined;
    if (!row) return undefined;
    return { syncId: row.sync_id, authTokenHash: row.auth_token_hash, createdAt: row.created_at, lastSeq: row.last_seq };
  }

  deleteAccount(syncId: string): void {
    this.db.prepare('DELETE FROM accounts WHERE sync_id = ?').run(syncId);
  }

  touchAccount(syncId: string, now = Date.now()): void {
    this.db.prepare('UPDATE accounts SET last_used_at = ? WHERE sync_id = ?').run(now, syncId);
  }

  countAccounts(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n;
  }

  /** Konten löschen, die seit "before" (Millisekunden) nicht benutzt wurden. Gibt die Anzahl zurück. */
  deleteInactiveAccounts(before: number): number {
    return Number(this.db.prepare('DELETE FROM accounts WHERE last_used_at < ?').run(before).changes);
  }

  countRecords(syncId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM records WHERE sync_id = ?').get(syncId) as { n: number };
    return row.n;
  }

  // ---------- Einträge ----------

  pull(syncId: string, since: number, limit: number): PullResponse {
    const rows = this.db
      .prepare('SELECT id, seq, data FROM records WHERE sync_id = ? AND seq > ? ORDER BY seq LIMIT ?')
      .all(syncId, since, limit + 1) as unknown as EncryptedRecord[];
    const hasMore = rows.length > limit;
    const records = rows.slice(0, limit).map((r) => ({ id: r.id, seq: r.seq, data: r.data }));
    return { records, seq: records.length ? records[records.length - 1]!.seq : since, hasMore };
  }

  /**
   * Einträge speichern – alles oder nichts (Transaktion).
   * Einträge, deren baseSeq nicht zum Server-Stand passt, werden als Konflikt gemeldet.
   */
  push(syncId: string, records: PushRecord[], maxRecords: number): PushResponse {
    const getSeq = this.db.prepare('SELECT seq FROM records WHERE sync_id = ? AND id = ?');
    const upsert = this.db.prepare(
      `INSERT INTO records (sync_id, id, seq, data) VALUES (?, ?, ?, ?)
       ON CONFLICT (sync_id, id) DO UPDATE SET seq = excluded.seq, data = excluded.data`,
    );
    const nextSeq = this.db.prepare(
      'UPDATE accounts SET last_seq = last_seq + 1 WHERE sync_id = ? RETURNING last_seq',
    );

    const accepted: PushResponse['accepted'] = [];
    const conflicts: string[] = [];
    let added = 0;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const r of records) {
        const current = getSeq.get(syncId, r.id) as { seq: number } | undefined;
        if ((current?.seq ?? 0) !== r.baseSeq) {
          conflicts.push(r.id);
          continue;
        }
        if (!current) added++;
        const { last_seq: seq } = nextSeq.get(syncId) as { last_seq: number };
        upsert.run(syncId, r.id, seq, r.data);
        accepted.push({ id: r.id, seq });
      }
      if (added > 0 && this.countRecords(syncId) > maxRecords) throw new RecordLimitError(maxRecords);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return { accepted, conflicts };
  }
}
