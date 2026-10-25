import { describe, expect, it } from 'vitest';
import { createId, isValidId } from './id';

describe('createId', () => {
  it('erzeugt gültige IDs', () => {
    expect(isValidId(createId())).toBe(true);
  });

  it('erzeugt jedes Mal eine andere ID', () => {
    const ids = new Set(Array.from({ length: 1000 }, createId));
    expect(ids.size).toBe(1000);
  });
});

describe('isValidId', () => {
  it('lehnt ungültige Texte ab', () => {
    expect(isValidId('')).toBe(false);
    expect(isValidId('hallo')).toBe(false);
  });
});
