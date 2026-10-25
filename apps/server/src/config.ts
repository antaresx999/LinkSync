/** Einstellungen des Servers, gelesen aus Umgebungsvariablen (siehe docs/SERVER.md). */

export interface Config {
  /** Port, auf dem der Server lauscht. Standard: 8080 */
  port: number;
  /** Adresse, auf der der Server lauscht. "127.0.0.1" = nur lokal (hinter Reverse-Proxy). Standard: 0.0.0.0 */
  host: string;
  /** Pfad zur Datenbankdatei. Standard: ./data/linksync.sqlite */
  databasePath: string;
  /** Dürfen neue Konten angelegt werden? Standard: true */
  allowNewAccounts: boolean;
  /** Höchstzahl Einträge pro Konto. Standard: 50'000 */
  maxRecordsPerAccount: number;
  /** Höchstzahl Konten auf dem Server, 0 = unbegrenzt. Standard: 0 */
  maxAccounts: number;
  /** Anfragen pro Minute und IP-Adresse, 0 = unbegrenzt. Standard: 120 */
  rateLimitPerMinute: number;
  /** Neue Konten pro Stunde und IP-Adresse, 0 = unbegrenzt. Standard: 3 */
  newAccountsPerHour: number;
  /** Konten löschen, die so viele Tage nicht benutzt wurden, 0 = nie. Standard: 0 */
  deleteInactiveAfterDays: number;
  /** Läuft der Server hinter einem Reverse-Proxy? Dann wird X-Forwarded-For vertraut. Standard: false */
  trustProxy: boolean;
  /** Optionale Nachricht, die Geräte anzeigen können (z. B. Wartungshinweis). */
  message: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: toInt(env.PORT, 8080, 1),
    host: env.HOST || '0.0.0.0',
    databasePath: env.DATABASE_PATH ?? './data/linksync.sqlite',
    allowNewAccounts: toBool(env.ALLOW_NEW_ACCOUNTS, true),
    maxRecordsPerAccount: toInt(env.MAX_RECORDS_PER_ACCOUNT, 50_000, 1),
    maxAccounts: toInt(env.MAX_ACCOUNTS, 0),
    rateLimitPerMinute: toInt(env.RATE_LIMIT_PER_MINUTE, 120),
    newAccountsPerHour: toInt(env.NEW_ACCOUNTS_PER_HOUR, 3),
    deleteInactiveAfterDays: toInt(env.DELETE_INACTIVE_AFTER_DAYS, 0),
    trustProxy: toBool(env.TRUST_PROXY, false),
    message: env.SERVER_MESSAGE ?? '',
  };
}

function toInt(value: string | undefined, fallback: number, min = 0): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new Error(`Ungültige Zahl in der Konfiguration: ${value}`);
  return n;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (/^(true|1|yes|ja)$/i.test(value)) return true;
  if (/^(false|0|no|nein)$/i.test(value)) return false;
  throw new Error(`Ungültiger Wahrheitswert in der Konfiguration: ${value}`);
}
