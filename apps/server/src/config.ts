/** Einstellungen des Servers, gelesen aus Umgebungsvariablen. */

export interface Config {
  /** Port, auf dem der Server lauscht. Standard: 8080 */
  port: number;
  /** Pfad zur Datenbankdatei. Standard: ./data/linksync.sqlite */
  databasePath: string;
  /** Dürfen neue Konten angelegt werden? Standard: true */
  allowNewAccounts: boolean;
  /** Höchstzahl Einträge pro Konto. Standard: 50'000 */
  maxRecordsPerAccount: number;
  /** Optionale Nachricht, die Geräte anzeigen können (z. B. Wartungshinweis). */
  message: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: toInt(env.PORT, 8080),
    databasePath: env.DATABASE_PATH ?? './data/linksync.sqlite',
    allowNewAccounts: (env.ALLOW_NEW_ACCOUNTS ?? 'true').toLowerCase() !== 'false',
    maxRecordsPerAccount: toInt(env.MAX_RECORDS_PER_ACCOUNT, 50_000),
    message: env.SERVER_MESSAGE ?? '',
  };
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Ungültige Zahl in der Konfiguration: ${value}`);
  return n;
}
