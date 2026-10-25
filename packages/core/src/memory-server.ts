/**
 * Ein Server im Arbeitsspeicher für Tests. Er verhält sich wie der echte
 * Server (Phase 2) und dient diesem auch als Vorlage.
 */

import type { EncryptedRecord, PullResponse, PushRequest, PushResponse, SyncTransport } from './protocol';

export class MemoryServer {
  private seq = 0;
  private readonly records = new Map<string, EncryptedRecord>();

  pull(since: number, limit = 1000): PullResponse {
    const newer = [...this.records.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const page = newer.slice(0, limit);
    return {
      records: page.map((r) => ({ ...r })),
      seq: page.length ? page[page.length - 1]!.seq : since,
      hasMore: newer.length > page.length,
    };
  }

  push(request: PushRequest): PushResponse {
    const accepted: PushResponse['accepted'] = [];
    const conflicts: string[] = [];
    for (const r of request.records) {
      const current = this.records.get(r.id);
      if ((current?.seq ?? 0) !== r.baseSeq) {
        conflicts.push(r.id);
        continue;
      }
      const seq = ++this.seq;
      this.records.set(r.id, { id: r.id, seq, data: r.data });
      accepted.push({ id: r.id, seq });
    }
    return { accepted, conflicts };
  }

  /** Verbindung für ein Gerät. Mit pageSize lässt sich seitenweises Abholen testen. */
  transport(pageSize = 1000): SyncTransport {
    return {
      pull: async (since) => this.pull(since, pageSize),
      push: async (request) => this.push(request),
    };
  }

  /** Nur für Tests: alle gespeicherten Daten. */
  dump(): EncryptedRecord[] {
    return [...this.records.values()];
  }
}
