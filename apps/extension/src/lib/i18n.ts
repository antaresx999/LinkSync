/**
 * Übersetzungen der Erweiterung. Die Sprache richtet sich nach dem Browser:
 * Deutsch, wenn der Browser auf Deutsch eingestellt ist, sonst Englisch.
 *
 * Neue Sprache hinzufügen: Objekt wie "en" anlegen und in DICTIONARIES eintragen.
 */

const de = {
  // Allgemein
  appName: 'LinkSync',
  loading: 'Lädt …',
  pleaseWait: 'Bitte warten …',
  cancel: 'Abbrechen',

  // Einrichten
  tabCreate: 'Neues Konto',
  tabConnect: 'Verbinden',
  createIntro: 'Lädt die Lesezeichen dieses Browsers verschlüsselt auf den Server.',
  connectWarning: 'Die Lesezeichen in diesem Browser werden durch die synchronisierten ersetzt. Eine Sicherung wird vorher angelegt.',
  server: 'Server',
  serverHint: 'Adresse deines LinkSync-Servers, z. B. sync.example.com.',
  serverHowTo: 'Eigenen Server einrichten',
  httpWarning: 'Unverschlüsselte Verbindung (http). Deine Lesezeichen bleiben verschlüsselt, aber das Anmelde-Token könnte im Netzwerk mitgelesen werden. Nur im vertrauenswürdigen Heimnetz verwenden – besser https.',
  syncId: 'Sync-ID',
  password: 'Passwort',
  passwordRepeat: 'Passwort wiederholen',
  passwordHint: 'Merke dir das Passwort gut. Es verlässt nie dein Gerät – ohne es sind deine Lesezeichen nicht wiederherstellbar.',
  passwordTooShort: 'Das Passwort muss mindestens 10 Zeichen lang sein.',
  passwordMismatch: 'Die Passwörter stimmen nicht überein.',
  createButton: 'Konto anlegen',
  connectButton: 'Verbinden',

  // Status
  statusOk: 'Synchronisiert',
  statusError: 'Problem beim Synchronisieren',
  lastSync: 'Letzter Sync',
  never: 'noch nie',
  justNow: 'gerade eben',
  minutesAgo: 'vor {n} Min.',
  bookmarks: 'Lesezeichen',
  copy: 'Kopieren',
  copied: 'Kopiert ✓',
  connectHint: 'Mit Sync-ID und Passwort verbindest du weitere Browser.',
  syncNow: 'Jetzt synchronisieren',
  syncing: 'Synchronisiere …',
  disconnect: 'Verbindung trennen',
  disconnectConfirm: 'Verbindung trennen? Die Lesezeichen in diesem Browser bleiben erhalten.',
  settings: 'Sicherung & Import',

  // Suche
  searchPlaceholder: 'Lesezeichen suchen …',
  searchNoResults: 'Nichts gefunden.',

  // Einstellungsseite
  optionsTitle: 'LinkSync – Sicherung & Import',
  notConfigured: 'Richte zuerst über das LinkSync-Symbol in der Symbolleiste ein Konto ein oder verbinde dich.',
  account: 'Konto',
  backupTitle: 'Sicherung',
  backupIntro: 'Lädt alle synchronisierten Lesezeichen als Datei herunter. Achtung: Die Datei ist nicht verschlüsselt.',
  backupDownload: 'Sicherung herunterladen',
  restoreTitle: 'Sicherung einspielen',
  restoreIntro: 'LinkSync- oder xBrowserSync-Sicherungsdatei auswählen.',
  chooseFile: 'Datei auswählen',
  modeMerge: 'Zusätzlich übernehmen (vorhandene Adressen werden übersprungen)',
  modeReplace: 'Alles ersetzen (auf allen verbundenen Geräten!)',
  replaceConfirm: 'Wirklich alle Lesezeichen auf allen verbundenen Geräten ersetzen?',
  importButton: 'Übernehmen',
  fileContains: 'Datei enthält {bookmarks} Lesezeichen und {folders} Ordner ({format}).',
  importDone: '{bookmarks} Lesezeichen und {folders} Ordner übernommen, {skipped} übersprungen.',
  unsupportedFile: 'Unbekanntes Dateiformat. Erwartet wird eine LinkSync- oder xBrowserSync-Sicherung.',
  invalidJson: 'Die Datei konnte nicht gelesen werden (kein gültiges JSON).',
  xbsTitle: 'Von xBrowserSync umsteigen',
  xbsIntro: 'Übernimmt deine Lesezeichen direkt von deinem bisherigen xBrowserSync-Server. Beschreibungen und Tags gibt es in LinkSync nicht, sie werden weggelassen.',
  xbsServer: 'xBrowserSync-Server',
  xbsSyncId: 'xBrowserSync-ID',
  xbsPassword: 'xBrowserSync-Passwort',
  xbsFileHint: 'Alternativ: Eine xBrowserSync-Sicherungsdatei oben unter „Sicherung einspielen" auswählen.',
  connectBackupTitle: 'Lesezeichen vor dem Verbinden',
  connectBackupIntro: 'Beim Verbinden am {date} wurden die Lesezeichen dieses Browsers ersetzt. Hier kannst du sie zusätzlich übernehmen.',
  connectBackupButton: 'Alte Lesezeichen übernehmen',
  deleteTitle: 'Konto löschen',
  deleteIntro: 'Löscht dein Konto und alle verschlüsselten Lesezeichen endgültig vom Server. Die Lesezeichen in diesem Browser bleiben erhalten. Andere verbundene Browser können danach nicht mehr synchronisieren.',
  deleteButton: 'Konto und Daten auf dem Server löschen',
  deleteConfirm: 'Konto und alle Daten auf dem Server endgültig löschen? Das lässt sich nicht rückgängig machen.',
  deleteDone: 'Konto gelöscht. Die Lesezeichen in diesem Browser sind erhalten geblieben.',
  privacy: 'Datenschutz',

  // Fehler
  errInvalidServer: 'Bitte eine gültige Server-Adresse eingeben, z. B. https://sync.example.com',
  errAuth: 'Sync-ID oder Passwort falsch.',
  errUnreachable: 'Server {url} nicht erreichbar.',
  errServer: 'Server meldet: {message}',
  errProtocol: 'Der Server spricht Protokoll {server}, diese Erweiterung {client}.',
  errKeyMissing: 'Schlüssel fehlt. Bitte die Verbindung trennen und neu verbinden.',
  errNotCreated: '{n} Lesezeichen konnten in diesem Browser nicht angelegt werden.',
  errNotConfigured: 'Kein Konto eingerichtet.',
  errNoBackup: 'Keine Sicherung vorhanden.',
  errBackground: 'Keine Antwort vom Hintergrunddienst.',
  xbs_invalidId: 'Eine xBrowserSync-ID besteht aus 32 Zeichen (0–9, a–f).',
  xbs_unreachable: 'xBrowserSync-Server nicht erreichbar.',
  xbs_notFound: 'Diese Sync-ID gibt es auf dem xBrowserSync-Server nicht.',
  xbs_serverError: 'Der xBrowserSync-Server meldet einen Fehler.',
  xbs_legacy: 'Diese Daten stammen von xBrowserSync vor Version 1.5. Bitte dort eine Sicherungsdatei erstellen und diese einspielen.',
  xbs_wrongPassword: 'Passwort für xBrowserSync falsch.',
  xbs_corrupt: 'Die Daten von xBrowserSync sind beschädigt.',
};

type Dictionary = typeof de;
export type MessageKey = keyof Dictionary;

const en: Dictionary = {
  appName: 'LinkSync',
  loading: 'Loading …',
  pleaseWait: 'Please wait …',
  cancel: 'Cancel',

  tabCreate: 'New account',
  tabConnect: 'Connect',
  createIntro: "Uploads this browser's bookmarks to the server, encrypted.",
  connectWarning: 'The bookmarks in this browser will be replaced by the synced ones. A backup is made first.',
  server: 'Server',
  serverHint: 'Address of your LinkSync server, e.g. sync.example.com.',
  serverHowTo: 'Set up your own server',
  httpWarning: 'Unencrypted connection (http). Your bookmarks stay encrypted, but the login token could be read on the network. Only use in a trusted home network – https is better.',
  syncId: 'Sync ID',
  password: 'Password',
  passwordRepeat: 'Repeat password',
  passwordHint: 'Remember this password. It never leaves your device – without it your bookmarks cannot be recovered.',
  passwordTooShort: 'The password must be at least 10 characters long.',
  passwordMismatch: 'The passwords do not match.',
  createButton: 'Create account',
  connectButton: 'Connect',

  statusOk: 'In sync',
  statusError: 'Sync problem',
  lastSync: 'Last sync',
  never: 'never',
  justNow: 'just now',
  minutesAgo: '{n} min ago',
  bookmarks: 'Bookmarks',
  copy: 'Copy',
  copied: 'Copied ✓',
  connectHint: 'Use the sync ID and password to connect more browsers.',
  syncNow: 'Sync now',
  syncing: 'Syncing …',
  disconnect: 'Disconnect',
  disconnectConfirm: 'Disconnect? The bookmarks in this browser are kept.',
  settings: 'Backup & import',

  searchPlaceholder: 'Search bookmarks …',
  searchNoResults: 'Nothing found.',

  optionsTitle: 'LinkSync – Backup & import',
  notConfigured: 'First create an account or connect using the LinkSync icon in the toolbar.',
  account: 'Account',
  backupTitle: 'Backup',
  backupIntro: 'Downloads all synced bookmarks as a file. Note: the file is not encrypted.',
  backupDownload: 'Download backup',
  restoreTitle: 'Restore backup',
  restoreIntro: 'Choose a LinkSync or xBrowserSync backup file.',
  chooseFile: 'Choose file',
  modeMerge: 'Add to existing (addresses already present are skipped)',
  modeReplace: 'Replace everything (on all connected devices!)',
  replaceConfirm: 'Really replace all bookmarks on all connected devices?',
  importButton: 'Import',
  fileContains: 'File contains {bookmarks} bookmarks and {folders} folders ({format}).',
  importDone: 'Imported {bookmarks} bookmarks and {folders} folders, skipped {skipped}.',
  unsupportedFile: 'Unknown file format. Expected a LinkSync or xBrowserSync backup.',
  invalidJson: 'The file could not be read (not valid JSON).',
  xbsTitle: 'Switch from xBrowserSync',
  xbsIntro: 'Imports your bookmarks directly from your previous xBrowserSync server. LinkSync has no descriptions or tags, so they are left out.',
  xbsServer: 'xBrowserSync server',
  xbsSyncId: 'xBrowserSync ID',
  xbsPassword: 'xBrowserSync password',
  xbsFileHint: 'Alternatively: choose an xBrowserSync backup file under "Restore backup" above.',
  connectBackupTitle: 'Bookmarks from before connecting',
  connectBackupIntro: "When connecting on {date}, this browser's bookmarks were replaced. You can add them back here.",
  connectBackupButton: 'Add old bookmarks',
  deleteTitle: 'Delete account',
  deleteIntro: 'Permanently deletes your account and all encrypted bookmarks from the server. The bookmarks in this browser are kept. Other connected browsers can no longer sync.',
  deleteButton: 'Delete account and data on the server',
  deleteConfirm: 'Permanently delete the account and all data on the server? This cannot be undone.',
  deleteDone: 'Account deleted. The bookmarks in this browser have been kept.',
  privacy: 'Privacy',

  errInvalidServer: 'Please enter a valid server address, e.g. https://sync.example.com',
  errAuth: 'Wrong sync ID or password.',
  errUnreachable: 'Cannot reach server {url}.',
  errServer: 'Server says: {message}',
  errProtocol: 'The server speaks protocol {server}, this extension {client}.',
  errKeyMissing: 'Key missing. Please disconnect and connect again.',
  errNotCreated: '{n} bookmarks could not be created in this browser.',
  errNotConfigured: 'No account set up.',
  errNoBackup: 'No backup available.',
  errBackground: 'No response from the background service.',
  xbs_invalidId: 'An xBrowserSync ID has 32 characters (0–9, a–f).',
  xbs_unreachable: 'Cannot reach the xBrowserSync server.',
  xbs_notFound: 'This sync ID does not exist on the xBrowserSync server.',
  xbs_serverError: 'The xBrowserSync server reported an error.',
  xbs_legacy: 'This data is from xBrowserSync before version 1.5. Please create a backup file there and restore it here.',
  xbs_wrongPassword: 'Wrong xBrowserSync password.',
  xbs_corrupt: 'The xBrowserSync data is damaged.',
};

const DICTIONARIES = { de, en } as const;
export type Language = keyof typeof DICTIONARIES;

export function detectLanguage(): Language {
  let lang = 'en';
  try {
    const g = globalThis as { browser?: { i18n?: { getUILanguage?: () => string } }; navigator?: { language?: string } };
    lang = g.browser?.i18n?.getUILanguage?.() ?? g.navigator?.language ?? 'en';
  } catch {
    // Standard: Englisch
  }
  return lang.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let current: Language = detectLanguage();

/** Nur für Tests. */
export function setLanguage(lang: Language): void {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

/** Text in der aktuellen Sprache, Platzhalter wie {n} werden ersetzt. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return DICTIONARIES[current][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
