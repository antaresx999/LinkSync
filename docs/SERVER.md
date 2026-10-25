# LinkSync-Server betreiben

Der Server speichert nur verschlüsselte Daten. Selbst wer Zugriff auf die Datenbank hat, kann keine Lesezeichen lesen.

## Lokal starten (zum Entwickeln)

```bash
pnpm server
```

Der Server läuft dann auf http://localhost:8080. Die Datenbank liegt in `apps/server/data/linksync.sqlite`. Beenden mit `Ctrl-C`.

Prüfen, ob alles funktioniert (in einem zweiten Terminal):

```bash
pnpm --filter @linksync/server smoke
```

## Mit Docker betreiben (auf einem Server)

```bash
docker compose up -d
```

Die Daten liegen im Docker-Volume `linksync-data`. Für den Betrieb im Internet gehört ein Reverse-Proxy mit HTTPS davor (z. B. Caddy oder Traefik). Ohne HTTPS könnten Anmelde-Tokens mitgelesen werden.

## Einstellungen (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `8080` | Port des Servers |
| `DATABASE_PATH` | `./data/linksync.sqlite` | Pfad zur Datenbankdatei |
| `ALLOW_NEW_ACCOUNTS` | `true` | `false` = nur bestehende Konten dürfen synchronisieren |
| `MAX_RECORDS_PER_ACCOUNT` | `50000` | Höchstzahl Lesezeichen und Ordner pro Konto |
| `SERVER_MESSAGE` | leer | Hinweis, den die Geräte anzeigen können |

## Backup

Die ganze Datenbank ist eine einzige Datei. Für ein Backup im laufenden Betrieb:

```bash
sqlite3 data/linksync.sqlite ".backup backup.sqlite"
```

## Noch offen
- Begrenzung, wie oft eine Adresse pro Stunde Konten anlegen darf. Bis dahin für öffentliche Server `ALLOW_NEW_ACCOUNTS=false` setzen, sobald die eigenen Konten angelegt sind.
- Automatisches Aufräumen lange unbenutzter Konten.
