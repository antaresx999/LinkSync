import { describe, expect, it } from 'vitest';
import { formatClock } from './clock';
import { parseRecord, type ItemFields } from './model';
import { createRecord, mergeRecords, recordsEqual, updateRecord } from './record';

const t = (ms: number, node = 'a') => formatClock(ms, 0, node);
const base: ItemFields = {
  kind: 'bookmark',
  parentId: 'toolbar',
  title: 'Beispiel',
  url: 'https://example.com',
  position: 'a0',
  deleted: false,
};

describe('Einträge zusammenführen', () => {
  const original = createRecord('x', base, t(1));

  it('behält Änderungen an verschiedenen Feldern von beiden Seiten', () => {
    const a = updateRecord(original, { title: 'Neuer Titel' }, t(2, 'a'));
    const b = updateRecord(original, { parentId: 'menu' }, t(3, 'b'));
    const merged = mergeRecords(a, b);
    expect(merged.fields.title).toBe('Neuer Titel');
    expect(merged.fields.parentId).toBe('menu');
  });

  it('nimmt beim selben Feld die neuere Änderung', () => {
    const a = updateRecord(original, { title: 'Älter' }, t(2, 'a'));
    const b = updateRecord(original, { title: 'Neuer' }, t(3, 'b'));
    expect(mergeRecords(a, b).fields.title).toBe('Neuer');
    expect(mergeRecords(b, a).fields.title).toBe('Neuer');
  });

  it('liefert in beiden Reihenfolgen dasselbe Ergebnis', () => {
    const a = updateRecord(original, { title: 'A', deleted: true }, t(5, 'a'));
    const b = updateRecord(original, { title: 'B', url: 'https://b.example' }, t(5, 'b'));
    expect(recordsEqual(mergeRecords(a, b), mergeRecords(b, a))).toBe(true);
  });

  it('vergibt keinen neuen Zeitstempel, wenn sich nichts ändert', () => {
    const same = updateRecord(original, { title: 'Beispiel' }, t(9));
    expect(recordsEqual(same, original)).toBe(true);
  });
});

describe('parseRecord', () => {
  it('akzeptiert gültige Einträge', () => {
    const r = createRecord('x', base, t(1));
    expect(parseRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('lehnt ungültige Daten ab', () => {
    const r = createRecord('x', base, t(1));
    expect(() => parseRecord(null)).toThrow();
    expect(() => parseRecord({ ...r, id: 'toolbar' })).toThrow();
    expect(() => parseRecord({ ...r, fields: { ...r.fields, kind: 'virus' } })).toThrow();
    expect(() => parseRecord({ ...r, clocks: { ...r.clocks, title: 5 } })).toThrow();
  });
});
