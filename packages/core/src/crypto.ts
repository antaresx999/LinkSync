/**
 * Verschlüsselung von LinkSync.
 *
 * Aus Sync-ID und Passwort entstehen zwei voneinander unabhängige Schlüssel:
 *
 *   Passwort + Sync-ID
 *        │  PBKDF2-SHA256, 600'000 Runden (bremst Passwort-Raten aus)
 *        ▼
 *   Hauptschlüssel
 *        │  HKDF (zwei getrennte Ableitungen)
 *        ├──▶ Verschlüsselungsschlüssel  – verlässt nie das Gerät
 *        └──▶ Anmelde-Token             – geht an den Server
 *
 * Der Server speichert nur einen Hash des Anmelde-Tokens. Er kann damit
 * prüfen, ob ein Gerät schreiben darf, aber nichts entschlüsseln.
 *
 * Jeder Eintrag wird einzeln mit AES-256-GCM verschlüsselt. Die ID des
 * Eintrags fliesst als "zusätzliche Daten" ein: Der Server kann verschlüsselte
 * Einträge also nicht unbemerkt vertauschen.
 */

import { base64UrlToBytes, bytesToBase64Url, bytesToHex, utf8 } from './encoding';
import { parseRecord, type ItemRecord } from './model';

export const KDF_ITERATIONS = 600_000;
const FORMAT_VERSION = '1';
const IV_LENGTH = 12;

export interface SyncKeys {
  /** Schlüssel zum Ver- und Entschlüsseln. Nicht exportierbar. */
  encryptionKey: CryptoKey;
  /** Geheimes Token für die Anmeldung beim Server. */
  authToken: string;
}

export class DecryptionError extends Error {
  constructor(cause?: unknown) {
    super('Entschlüsseln fehlgeschlagen (falsches Passwort oder beschädigte Daten)', { cause });
    this.name = 'DecryptionError';
  }
}

/** Beide Schlüssel aus Sync-ID und Passwort ableiten. Dauert absichtlich etwa eine Sekunde. */
export async function deriveKeys(
  syncId: string,
  password: string,
  iterations: number = KDF_ITERATIONS,
): Promise<SyncKeys> {
  if (!password) throw new Error('Passwort fehlt');

  const passwordKey = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  const masterBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: utf8(`linksync/v1/${syncId}`), iterations },
    passwordKey,
    256,
  );
  const masterKey = await crypto.subtle.importKey('raw', masterBits, 'HKDF', false, ['deriveKey', 'deriveBits']);

  const encryptionKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: utf8('linksync/v1/encryption') },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const authBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: utf8('linksync/v1/auth') },
    masterKey,
    256,
  );

  return { encryptionKey, authToken: bytesToBase64Url(new Uint8Array(authBits)) };
}

/** Hash des Anmelde-Tokens. Nur dieser wird auf dem Server gespeichert. */
export async function hashAuthToken(authToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8(authToken));
  return bytesToHex(new Uint8Array(digest));
}

/** Eintrag verschlüsseln. Ergebnis: "1.<Base64url von IV + Geheimtext>". */
export async function encryptRecord(key: CryptoKey, record: ItemRecord): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = utf8(JSON.stringify(record));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(record.id) },
    key,
    plaintext,
  );
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);
  return `${FORMAT_VERSION}.${bytesToBase64Url(combined)}`;
}

/** Eintrag entschlüsseln und prüfen. Wirft DecryptionError bei Fehlern. */
export async function decryptRecord(key: CryptoKey, id: string, data: string): Promise<ItemRecord> {
  let record: ItemRecord;
  try {
    const [version, payload] = data.split('.');
    if (version !== FORMAT_VERSION || !payload) throw new Error(`Unbekanntes Format ${version}`);
    const combined = base64UrlToBytes(payload);
    if (combined.length <= IV_LENGTH) throw new Error('Zu kurz');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, IV_LENGTH), additionalData: additionalData(id) },
      key,
      combined.slice(IV_LENGTH),
    );
    record = parseRecord(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch (err) {
    throw new DecryptionError(err);
  }
  if (record.id !== id) throw new DecryptionError(new Error('ID passt nicht'));
  return record;
}

function additionalData(id: string): Uint8Array<ArrayBuffer> {
  return utf8(`linksync/v1/record/${id}`);
}
