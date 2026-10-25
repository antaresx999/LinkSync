import { describe, expect, it } from 'vitest';
import { formatClock } from './clock';
import { DecryptionError, decryptRecord, deriveKeys, encryptRecord, hashAuthToken } from './crypto';
import { createRecord } from './record';

// Wenige Runden, damit die Tests schnell sind. Im echten Betrieb: 600'000.
const FAST = 1000;
const record = createRecord(
  'eintrag-1',
  { kind: 'bookmark', parentId: 'toolbar', title: 'Geheim', url: 'https://geheim.example', position: 'a0', deleted: false },
  formatClock(1, 0, 'a'),
);

describe('Schlüssel ableiten', () => {
  it('liefert für gleiche Eingaben dasselbe Anmelde-Token', async () => {
    const a = await deriveKeys('sync-1', 'passwort', FAST);
    const b = await deriveKeys('sync-1', 'passwort', FAST);
    expect(a.authToken).toBe(b.authToken);
  });

  it('liefert für anderes Passwort oder andere Sync-ID ein anderes Token', async () => {
    const a = await deriveKeys('sync-1', 'passwort', FAST);
    expect((await deriveKeys('sync-1', 'Passwort', FAST)).authToken).not.toBe(a.authToken);
    expect((await deriveKeys('sync-2', 'passwort', FAST)).authToken).not.toBe(a.authToken);
  });

  it('macht den Verschlüsselungsschlüssel nicht exportierbar', async () => {
    const { encryptionKey } = await deriveKeys('sync-1', 'passwort', FAST);
    expect(encryptionKey.extractable).toBe(false);
  });

  it('hasht das Token für den Server', async () => {
    const { authToken } = await deriveKeys('sync-1', 'passwort', FAST);
    const hash = await hashAuthToken(authToken);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(authToken);
  });
});

describe('Einträge verschlüsseln', () => {
  it('entschlüsselt wieder zum Original', async () => {
    const { encryptionKey } = await deriveKeys('sync-1', 'passwort', FAST);
    const data = await encryptRecord(encryptionKey, record);
    expect(await decryptRecord(encryptionKey, record.id, data)).toEqual(record);
  });

  it('verrät den Inhalt nicht', async () => {
    const { encryptionKey } = await deriveKeys('sync-1', 'passwort', FAST);
    const data = await encryptRecord(encryptionKey, record);
    expect(data).not.toContain('Geheim');
    expect(data).not.toContain('geheim.example');
    expect(data.startsWith('1.')).toBe(true);
  });

  it('erzeugt bei jedem Verschlüsseln einen anderen Geheimtext', async () => {
    const { encryptionKey } = await deriveKeys('sync-1', 'passwort', FAST);
    expect(await encryptRecord(encryptionKey, record)).not.toBe(await encryptRecord(encryptionKey, record));
  });

  it('scheitert mit falschem Passwort', async () => {
    const right = await deriveKeys('sync-1', 'passwort', FAST);
    const wrong = await deriveKeys('sync-1', 'falsch', FAST);
    const data = await encryptRecord(right.encryptionKey, record);
    await expect(decryptRecord(wrong.encryptionKey, record.id, data)).rejects.toThrow(DecryptionError);
  });

  it('erkennt vertauschte Einträge (andere ID)', async () => {
    const { encryptionKey } = await deriveKeys('sync-1', 'passwort', FAST);
    const data = await encryptRecord(encryptionKey, record);
    await expect(decryptRecord(encryptionKey, 'eintrag-2', data)).rejects.toThrow(DecryptionError);
  });

  it('erkennt manipulierte Daten', async () => {
    const { encryptionKey } = await deriveKeys('sync-1', 'passwort', FAST);
    const data = await encryptRecord(encryptionKey, record);
    const last = data.at(-2) === 'A' ? 'B' : 'A';
    const tampered = data.slice(0, -2) + last + data.slice(-1);
    await expect(decryptRecord(encryptionKey, record.id, tampered)).rejects.toThrow(DecryptionError);
    await expect(decryptRecord(encryptionKey, record.id, 'kaputt')).rejects.toThrow(DecryptionError);
  });
});
