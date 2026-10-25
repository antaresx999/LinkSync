/**
 * Datenmodell von LinkSync.
 *
 * Jedes Lesezeichen und jeder Ordner ist ein "Eintrag" (ItemRecord).
 * Jedes Feld eines Eintrags trägt seine eigene Uhrzeit (Clock). Beim
 * Zusammenführen gewinnt pro Feld die neuere Änderung. So gehen keine
 * Änderungen verloren, wenn zwei Geräte verschiedene Felder ändern.
 */

/** Die festen Hauptordner, die es in jedem Browser gibt. Sie sind keine Einträge. */
export const ROOT_IDS = ['toolbar', 'menu', 'other', 'mobile'] as const;
export type RootId = (typeof ROOT_IDS)[number];

/** Englische Standardnamen der Hauptordner. Die Oberfläche übersetzt sie. */
export const ROOT_TITLES: Record<RootId, string> = {
  toolbar: 'Bookmarks Toolbar',
  menu: 'Bookmarks Menu',
  other: 'Other Bookmarks',
  mobile: 'Mobile Bookmarks',
};

/** Hierher kommen Einträge, deren Ordner nicht mehr existiert. */
export const LOST_AND_FOUND: RootId = 'other';

export function isRootId(id: string): id is RootId {
  return (ROOT_IDS as readonly string[]).includes(id);
}

export type ItemKind = 'bookmark' | 'folder';

export interface ItemFields {
  kind: ItemKind;
  /** ID des übergeordneten Ordners oder eines Hauptordners. */
  parentId: string;
  title: string;
  /** Nur bei Lesezeichen gesetzt. */
  url: string | null;
  /** Sortierschlüssel innerhalb des Ordners (Text, alphabetisch sortiert). */
  position: string;
  /** Gelöschte Einträge bleiben als "Grabstein" erhalten, damit andere Geräte die Löschung erfahren. */
  deleted: boolean;
}

export type FieldName = keyof ItemFields;
export const FIELD_NAMES: readonly FieldName[] = ['kind', 'parentId', 'title', 'url', 'position', 'deleted'];

export interface ItemRecord {
  id: string;
  fields: ItemFields;
  /** Pro Feld: Zeitpunkt der letzten Änderung (siehe clock.ts). */
  clocks: Record<FieldName, string>;
}

export class InvalidRecordError extends Error {
  constructor(message: string) {
    super(`Ungültiger Eintrag: ${message}`);
    this.name = 'InvalidRecordError';
  }
}

/**
 * Prüft Daten aus fremder Quelle (z. B. nach dem Entschlüsseln) und gibt
 * einen sauberen Eintrag zurück. Wirft InvalidRecordError bei Fehlern.
 */
export function parseRecord(value: unknown): ItemRecord {
  if (!isObject(value)) throw new InvalidRecordError('kein Objekt');
  const { id, fields, clocks } = value;
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) throw new InvalidRecordError('id');
  if (isRootId(id)) throw new InvalidRecordError('id ist ein Hauptordner');
  if (!isObject(fields) || !isObject(clocks)) throw new InvalidRecordError('fields/clocks');

  const { kind, parentId, title, url, position, deleted } = fields;
  if (kind !== 'bookmark' && kind !== 'folder') throw new InvalidRecordError('kind');
  if (typeof parentId !== 'string' || parentId.length === 0) throw new InvalidRecordError('parentId');
  if (typeof title !== 'string') throw new InvalidRecordError('title');
  if (url !== null && typeof url !== 'string') throw new InvalidRecordError('url');
  if (typeof position !== 'string' || position.length === 0) throw new InvalidRecordError('position');
  if (typeof deleted !== 'boolean') throw new InvalidRecordError('deleted');

  const cleanClocks = {} as Record<FieldName, string>;
  for (const name of FIELD_NAMES) {
    const c = clocks[name];
    if (typeof c !== 'string' || c.length === 0) throw new InvalidRecordError(`clock ${name}`);
    cleanClocks[name] = c;
  }

  return { id, fields: { kind, parentId, title, url, position, deleted }, clocks: cleanClocks };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
