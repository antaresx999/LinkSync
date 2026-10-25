/**
 * Der Lesezeichenbaum eines Geräts.
 *
 * Intern ist er eine flache Liste von Einträgen (ItemRecord). Jeder Eintrag
 * kennt nur seinen Elternordner und seinen Sortierschlüssel. Daraus wird bei
 * Bedarf der sichtbare Baum gebaut (toTree).
 *
 * Beim Bauen werden Widersprüche aufgelöst, die durch gleichzeitige
 * Änderungen auf verschiedenen Geräten entstehen können:
 *  - Elternordner gelöscht oder unbekannt → Eintrag landet in "Weitere Lesezeichen".
 *  - Zwei Ordner gleichzeitig ineinander verschoben (Kreis) → einer davon
 *    landet in "Weitere Lesezeichen".
 * Alle Geräte lösen das gleich auf, weil die Regeln nur von den Daten abhängen.
 */

import { generateKeyBetween } from 'fractional-indexing';
import type { Clock } from './clock';
import { createId } from './id';
import { isRootId, LOST_AND_FOUND, ROOT_IDS, ROOT_TITLES, type ItemFields, type ItemRecord, type RootId } from './model';
import { createRecord, mergeRecords, recordsEqual, updateRecord } from './record';

export interface BookmarkNode {
  id: string;
  kind: 'bookmark';
  title: string;
  url: string;
}

export interface FolderNode {
  id: string;
  kind: 'folder';
  title: string;
  children: TreeNode[];
}

export type TreeNode = BookmarkNode | FolderNode;

export interface RootNode extends FolderNode {
  id: RootId;
}

export class TreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreeError';
  }
}

interface Layout {
  /** Tatsächlicher Elternordner jedes sichtbaren Eintrags. */
  parentOf: Map<string, string>;
  /** Sichtbare Kinder je Ordner, sortiert. */
  childrenOf: Map<string, ItemRecord[]>;
}

export class BookmarkTree {
  private readonly records = new Map<string, ItemRecord>();
  private readonly dirty = new Set<string>();
  private layoutCache: Layout | null = null;

  constructor(
    private readonly clock: Clock,
    records: Iterable<ItemRecord> = [],
    dirtyIds: Iterable<string> = [],
  ) {
    for (const r of records) this.records.set(r.id, r);
    for (const id of dirtyIds) if (this.records.has(id)) this.dirty.add(id);
  }

  // ---------- Lesen ----------

  get(id: string): ItemRecord | undefined {
    return this.records.get(id);
  }

  /** Alle Einträge inklusive Grabsteine (zum Speichern). */
  allRecords(): ItemRecord[] {
    return [...this.records.values()];
  }

  /** Lebt der Eintrag und ist er sichtbar? */
  exists(id: string): boolean {
    return this.layout().parentOf.has(id);
  }

  /** Der tatsächliche Elternordner (nach Auflösung von Widersprüchen). */
  parentOf(id: string): string | undefined {
    return this.layout().parentOf.get(id);
  }

  /** IDs der direkten Kinder eines Ordners, sortiert. Schneller als children(). */
  childIds(parentId: string): string[] {
    return (this.layout().childrenOf.get(parentId) ?? []).map((r) => r.id);
  }

  children(parentId: string): TreeNode[] {
    return (this.layout().childrenOf.get(parentId) ?? []).map((r) => this.toNode(r));
  }

  /** Den sichtbaren Baum bauen: die vier Hauptordner mit ihrem Inhalt. */
  toTree(): RootNode[] {
    return ROOT_IDS.map((id) => ({ id, kind: 'folder', title: ROOT_TITLES[id], children: this.children(id) }));
  }

  // ---------- Lokale Änderungen ----------

  addBookmark(parentId: string, title: string, url: string, index?: number): string {
    return this.add({ kind: 'bookmark', parentId, title, url }, index);
  }

  addFolder(parentId: string, title: string, index?: number): string {
    return this.add({ kind: 'folder', parentId, title, url: null }, index);
  }

  update(id: string, changes: { title?: string; url?: string }): void {
    const record = this.requireAlive(id);
    if (changes.url !== undefined && record.fields.kind !== 'bookmark') {
      throw new TreeError('Ordner haben keine URL');
    }
    this.store(updateRecord(record, changes, this.clock.tick()));
  }

  /** Verschieben, optional an eine bestimmte Stelle (0 = ganz oben). */
  move(id: string, parentId: string, index?: number): void {
    const record = this.requireAlive(id);
    this.requireFolder(parentId);
    if (record.fields.kind === 'folder' && (parentId === id || this.isAncestor(id, parentId))) {
      throw new TreeError('Ein Ordner kann nicht in sich selbst verschoben werden');
    }
    const position = this.positionFor(parentId, index, id);
    this.store(updateRecord(record, { parentId, position }, this.clock.tick()));
  }

  /** Löschen. Bei Ordnern wird der ganze Inhalt mitgelöscht. */
  remove(id: string): void {
    this.requireAlive(id);
    const toDelete = [id, ...this.descendants(id)];
    const stamp = this.clock.tick();
    for (const target of toDelete) {
      this.store(updateRecord(this.records.get(target)!, { deleted: true }, stamp));
    }
  }

  // ---------- Sync ----------

  /**
   * Fassung eines anderen Geräts übernehmen.
   * Gibt true zurück, wenn sich lokal etwas geändert hat.
   */
  applyRemote(remote: ItemRecord): boolean {
    for (const stamp of Object.values(remote.clocks)) this.clock.observe(stamp);
    const local = this.records.get(remote.id);
    if (!local) {
      this.records.set(remote.id, remote);
      this.layoutCache = null;
      return true;
    }
    const merged = mergeRecords(local, remote);
    // Hatte das lokale Gerät neuere Felder, muss die Zusammenführung wieder hochgeladen werden.
    // Sonst ist der Stand des Servers bereits aktuell.
    if (recordsEqual(merged, remote)) this.dirty.delete(remote.id);
    else this.dirty.add(remote.id);
    if (recordsEqual(merged, local)) return false;
    this.records.set(remote.id, merged);
    this.layoutCache = null;
    return true;
  }

  /** Einträge, die noch hochgeladen werden müssen. */
  getDirty(): ItemRecord[] {
    return [...this.dirty].map((id) => this.records.get(id)!);
  }

  dirtyIds(): string[] {
    return [...this.dirty];
  }

  /** Nach erfolgreichem Hochladen: als erledigt markieren, falls seither unverändert. */
  markClean(sent: ItemRecord): void {
    const current = this.records.get(sent.id);
    if (current && recordsEqual(current, sent)) this.dirty.delete(sent.id);
  }

  // ---------- Intern ----------

  private add(base: Omit<ItemFields, 'position' | 'deleted'>, index?: number): string {
    this.requireFolder(base.parentId);
    const id = createId();
    const position = this.positionFor(base.parentId, index);
    this.store(createRecord(id, { ...base, position, deleted: false }, this.clock.tick()));
    return id;
  }

  private store(record: ItemRecord): void {
    this.records.set(record.id, record);
    this.dirty.add(record.id);
    this.layoutCache = null;
  }

  private requireAlive(id: string): ItemRecord {
    const record = this.records.get(id);
    if (!record || !this.exists(id)) throw new TreeError(`Eintrag ${id} existiert nicht`);
    return record;
  }

  private requireFolder(id: string): void {
    if (isRootId(id)) return;
    const record = this.records.get(id);
    if (!record || !this.exists(id) || record.fields.kind !== 'folder') {
      throw new TreeError(`Ordner ${id} existiert nicht`);
    }
  }

  private isAncestor(ancestorId: string, id: string): boolean {
    const { parentOf } = this.layout();
    for (let p = parentOf.get(id); p !== undefined; p = parentOf.get(p)) {
      if (p === ancestorId) return true;
    }
    return false;
  }

  private descendants(id: string): string[] {
    const result: string[] = [];
    const stack = [id];
    while (stack.length) {
      for (const child of this.layout().childrenOf.get(stack.pop()!) ?? []) {
        result.push(child.id);
        stack.push(child.id);
      }
    }
    return result;
  }

  /** Sortierschlüssel für eine Einfügestelle berechnen. */
  private positionFor(parentId: string, index: number | undefined, movingId?: string): string {
    const siblings = (this.layout().childrenOf.get(parentId) ?? []).filter((r) => r.id !== movingId);
    const at = index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length));
    const before = siblings[at - 1]?.fields.position ?? null;
    // Haben zwei Geschwister zufällig denselben Schlüssel, nehmen wir den nächsten grösseren.
    const after = siblings.slice(at).find((r) => before === null || r.fields.position > before)?.fields.position ?? null;
    return generateKeyBetween(before, after);
  }

  private toNode(record: ItemRecord): TreeNode {
    const { kind, title, url } = record.fields;
    if (kind === 'bookmark') return { id: record.id, kind, title, url: url ?? '' };
    return { id: record.id, kind, title, children: this.children(record.id) };
  }

  private layout(): Layout {
    if (this.layoutCache) return this.layoutCache;

    const alive = [...this.records.values()].filter((r) => !r.fields.deleted);
    const isFolder = (id: string) => {
      const r = this.records.get(id);
      return r !== undefined && !r.fields.deleted && r.fields.kind === 'folder';
    };

    // 1. Elternordner bestimmen, fehlende Ordner auflösen.
    const parentOf = new Map<string, string>();
    for (const r of alive) {
      const p = r.fields.parentId;
      parentOf.set(r.id, isRootId(p) || isFolder(p) ? p : LOST_AND_FOUND);
    }

    // 2. Kreise auflösen: Pro Kreis wandert der Eintrag mit der kleinsten ID nach "Weitere Lesezeichen".
    const reachesRoot = new Set<string>();
    for (const r of [...alive].sort((a, b) => cmp(a.id, b.id))) {
      const path: string[] = [];
      const onPath = new Set<string>();
      let current = r.id;
      while (!isRootId(current) && !reachesRoot.has(current)) {
        if (onPath.has(current)) {
          const cycle = path.slice(path.indexOf(current));
          const breakAt = cycle.reduce((min, id) => (id < min ? id : min));
          parentOf.set(breakAt, LOST_AND_FOUND);
          break;
        }
        path.push(current);
        onPath.add(current);
        current = parentOf.get(current)!;
      }
      // Nach dem Aufbrechen eines Kreises erreichen alle Einträge auf dem Pfad einen Hauptordner.
      for (const id of path) reachesRoot.add(id);
    }

    // 3. Kinder je Ordner sortieren (nach Sortierschlüssel, bei Gleichstand nach ID).
    const childrenOf = new Map<string, ItemRecord[]>();
    for (const r of alive) {
      const p = parentOf.get(r.id)!;
      let list = childrenOf.get(p);
      if (!list) childrenOf.set(p, (list = []));
      list.push(r);
    }
    for (const list of childrenOf.values()) {
      list.sort((a, b) => cmp(a.fields.position, b.fields.position) || cmp(a.id, b.id));
    }

    this.layoutCache = { parentOf, childrenOf };
    return this.layoutCache;
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
