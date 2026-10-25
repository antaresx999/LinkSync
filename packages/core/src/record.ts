import { FIELD_NAMES, type FieldName, type ItemFields, type ItemRecord } from './model';

/** Neuen Eintrag anlegen. Alle Felder bekommen denselben Zeitstempel. */
export function createRecord(id: string, fields: ItemFields, clock: string): ItemRecord {
  const clocks = {} as Record<FieldName, string>;
  for (const name of FIELD_NAMES) clocks[name] = clock;
  return { id, fields: { ...fields }, clocks };
}

/** Felder ändern. Nur Felder mit neuem Wert bekommen einen neuen Zeitstempel. */
export function updateRecord(record: ItemRecord, changes: Partial<ItemFields>, clock: string): ItemRecord {
  const fields = { ...record.fields };
  const clocks = { ...record.clocks };
  for (const name of FIELD_NAMES) {
    if (!(name in changes)) continue;
    const value = changes[name];
    if (value === undefined || value === fields[name]) continue;
    (fields as Record<FieldName, unknown>)[name] = value;
    clocks[name] = clock;
  }
  return { id: record.id, fields, clocks };
}

/**
 * Zwei Fassungen desselben Eintrags zusammenführen: Pro Feld gewinnt der
 * neuere Zeitstempel. Das Ergebnis ist unabhängig von der Reihenfolge,
 * d. h. merge(a, b) und merge(b, a) liefern dasselbe.
 */
export function mergeRecords(a: ItemRecord, b: ItemRecord): ItemRecord {
  if (a.id !== b.id) throw new Error('Einträge mit unterschiedlicher ID');
  const fields = { ...a.fields };
  const clocks = { ...a.clocks };
  for (const name of FIELD_NAMES) {
    if (b.clocks[name] > a.clocks[name]) {
      (fields as Record<FieldName, unknown>)[name] = b.fields[name];
      clocks[name] = b.clocks[name];
    }
  }
  return { id: a.id, fields, clocks };
}

export function recordsEqual(a: ItemRecord, b: ItemRecord): boolean {
  if (a.id !== b.id) return false;
  return FIELD_NAMES.every((n) => a.fields[n] === b.fields[n] && a.clocks[n] === b.clocks[n]);
}

