# LinkSync-Server betreiben

Der Server speichert nur verschlüsselte Daten. Selbst wer Zugriff auf die Datenbank hat, kann keine Lesezeichen lesen.

## Variante 1: Direkt unter Linux (ohne Docker)

Für Debian, Ubuntu, Fedora, Raspberry Pi OS und andere Linux-Systeme mit systemd (x86_64, arm64, armv7).
Das Skript bringt sein eigenes Node.js mit und richtet LinkSync als Dienst ein, der beim Systemstart automatisch läuft.

### Installieren

```bash
curl -fsSL https://raw.githubusercontent.com/antaresx999/LinkSync/main/deploy/install.sh | sudo bash
```

Das Skript
- legt einen Systembenutzer `linksync` ohne Login an,
- lädt Node.js 24 von nodejs.org und LinkSync von GitHub (beides mit Prüfsumme),
- richtet den Dienst `linksync` ein (abgesichert: darf nur in sein Datenverzeichnis schreiben),
- startet den Server auf `127.0.0.1:8080` – erreichbar nur lokal, für den Reverse-Proxy.

| Was | Wo |
|---|---|
| Programm | `/opt/linksync/` |
| Einstellungen | `/etc/linksync/linksync.env` |
| Datenbank | `/var/lib/linksync/linksync.sqlite` |
| Sicherungen | `/var/lib/linksync/backups/` (die 10 neuesten) |
| Protokoll | `journalctl -u linksync` |

### Verwalten

| Befehl | Wirkung |
|---|---|
| `sudo linksync update` | neueste Version installieren – sichert vorher die Datenbank und kehrt automatisch zur alten Version zurück, falls die neue nicht startet |
| `sudo linksync update --version v0.2.0` | bestimmte Version installieren |
| `sudo linksync status` | Version, Zustand, ob ein Update verfügbar ist |
| `sudo linksync logs` | Protokoll live ansehen (Beenden mit Ctrl-C) |
| `sudo linksync backup` | Datenbank jetzt sichern |
| `sudo linksync config` | Einstellungen bearbeiten, danach wird neu gestartet |
| `sudo linksync uninstall` | entfernen; Daten und Einstellungen bleiben |
| `sudo linksync uninstall --purge` | alles entfernen, auch alle Daten |

### HTTPS davor

Der Server lauscht nur lokal. Für den Zugriff von aussen braucht es einen Reverse-Proxy mit HTTPS.
Am einfachsten mit **Caddy** (holt das Zertifikat automatisch):

```bash
sudo apt install caddy
```

In `/etc/caddy/Caddyfile`:
```
sync.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

Für **nginx** siehe das Beispiel unten bei Variante 2A – es funktioniert genauso.

### Wiederherstellen aus einer Sicherung

```bash
sudo systemctl stop linksync
sudo cp /var/lib/linksync/backups/linksync-JJJJMMTT-HHMMSS.sqlite /var/lib/linksync/linksync.sqlite
sudo rm -f /var/lib/linksync/linksync.sqlite-wal /var/lib/linksync/linksync.sqlite-shm
sudo chown linksync:linksync /var/lib/linksync/linksync.sqlite
sudo systemctl start linksync
```

## Variante 2: Mit Docker

Voraussetzungen: Docker mit Compose-Plugin, eine Domain (z. B. `sync.example.com`), deren DNS-Eintrag auf den Server zeigt.

### 1. Dateien holen

```bash
mkdir -p ~/linksync && cd ~/linksync
curl -fsSLO https://raw.githubusercontent.com/antaresx999/LinkSync/main/deploy/compose.yaml
curl -fsSLO https://raw.githubusercontent.com/antaresx999/LinkSync/main/deploy/compose.caddy.yaml
curl -fsSLO https://raw.githubusercontent.com/antaresx999/LinkSync/main/deploy/Caddyfile
curl -fsSL https://raw.githubusercontent.com/antaresx999/LinkSync/main/deploy/.env.example -o .env
```

`.env` öffnen und anpassen (mindestens `DOMAIN` bei Variante B).

### 2a. Variante 2A – du hast schon einen Reverse-Proxy

LinkSync lauscht nur lokal auf `127.0.0.1:8080`.

```bash
docker compose up -d
```

Im Reverse-Proxy `https://sync.example.com` → `http://127.0.0.1:8080` weiterleiten. Beispiele:

**nginx**
```nginx
server {
    server_name sync.example.com;
    listen 443 ssl http2;
    # ssl_certificate … (z. B. via certbot)
    client_max_body_size 12m;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

**Caddy**
```
sync.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

**Traefik:** In `compose.yaml` die `ports`-Zeile entfernen, den Dienst ins Traefik-Netzwerk hängen und Labels setzen (`traefik.http.routers.linksync.rule=Host(\`sync.example.com\`)`, `traefik.http.services.linksync.loadbalancer.server.port=8080`).

> Wichtig: Der Proxy muss `X-Forwarded-For` setzen. Sonst sieht LinkSync alle Anfragen als von derselben Adresse kommend, und die Begrenzungen greifen für alle gemeinsam.

### 2b. Variante 2B – kein Reverse-Proxy vorhanden

Caddy wird mitgestartet und holt das HTTPS-Zertifikat automatisch. Ports 80 und 443 müssen frei und von aussen erreichbar sein.

```bash
docker compose -f compose.caddy.yaml up -d
```

### 3. Prüfen

```bash
curl https://sync.example.com/v1/info
```

Antwort z. B. `{"name":"LinkSync","version":"0.1.0","protocol":1,…}`.

### Aktualisieren

```bash
docker compose pull && docker compose up -d          # Variante A
docker compose -f compose.caddy.yaml pull && docker compose -f compose.caddy.yaml up -d   # Variante B
```

Das Image `ghcr.io/antaresx999/linksync-server` wird bei jeder Änderung auf `main` automatisch gebaut (für amd64 und arm64, also auch NAS und Raspberry Pi). Für eine feste Version statt `latest` z. B. `:0.1.0` verwenden.

### Backup

Die ganze Datenbank ist eine Datei im Docker-Volume `linksync-data`:

```bash
docker compose exec linksync node -e "new (require('node:sqlite').DatabaseSync)('/data/linksync.sqlite').exec(\"VACUUM INTO '/data/backup.sqlite'\")"
docker compose cp linksync:/data/backup.sqlite ./linksync-backup-$(date +%F).sqlite
```

## Einstellungen

Linux-Installation: `/etc/linksync/linksync.env` (bearbeiten mit `sudo linksync config`). Docker: `.env`.

| Variable | Standard | Bedeutung |
|---|---|---|
| `ALLOW_NEW_ACCOUNTS` | `true` | `false` = nur bestehende Konten dürfen synchronisieren |
| `MAX_ACCOUNTS` | `0` | Höchstzahl Konten (0 = unbegrenzt) |
| `MAX_RECORDS_PER_ACCOUNT` | `50000` | Höchstzahl Lesezeichen und Ordner pro Konto |
| `RATE_LIMIT_PER_MINUTE` | `120` | Anfragen pro Minute und IP-Adresse (0 = unbegrenzt) |
| `NEW_ACCOUNTS_PER_HOUR` | `3` | neue Konten pro Stunde und IP-Adresse (0 = unbegrenzt) |
| `DELETE_INACTIVE_AFTER_DAYS` | `0` | Konten nach so vielen Tagen ohne Nutzung löschen (0 = nie). In der Datenschutzerklärung erwähnen! |
| `TRUST_PROXY` | `false` (in den Compose-Dateien `true`) | `X-Forwarded-For` vom Reverse-Proxy vertrauen |
| `SERVER_MESSAGE` | leer | Hinweis, den die Geräte anzeigen können |
| `HOST` | `0.0.0.0` (Linux-Installation: `127.0.0.1`) | Adresse, auf der der Server lauscht |
| `PORT` | `8080` | Port (1024 oder höher) |
| `DATABASE_PATH` | `/data/linksync.sqlite` (Linux-Installation: `/var/lib/linksync/linksync.sqlite`) | Pfad zur Datenbank |

## Fehlersuche: Erweiterung erreicht den Server nicht

Zuerst auf dem Rechner prüfen, **auf dem der Browser läuft** (nicht auf dem Server):

```bash
curl https://sync.example.com/v1/info
```

| Ergebnis | Ursache und Lösung |
|---|---|
| `Could not resolve host` | Der Name ist im DNS dieses Rechners unbekannt. Häufig bei einem **internen DNS-Server**, der die eigene Domain selbst verwaltet (Split-DNS, z. B. Active Directory, Pi-hole, Router): Dort fehlt der Eintrag. Lösung: im internen DNS einen A-Eintrag (auf die öffentliche IP des Proxys oder die interne IP des Proxys) oder einen CNAME anlegen. |
| HTML-Anmeldeseite statt JSON | Der Reverse-Proxy verlangt eine Anmeldung (z. B. Pangolin-SSO, Authelia). Die Erweiterung kann sich dort nicht anmelden. Lösung: Anmeldung für diese Ressource abschalten – LinkSync schützt die Daten selbst. |
| `{"name":"LinkSync",…}` | Server erreichbar. Klappt es trotzdem nicht, LinkSync-Erweiterung auf Version 0.1.2 oder neuer aktualisieren. |

**Pangolin:** Bei der Ressource die *Authentifizierung* (Platform SSO, Passwort, PIN) ausschalten. Ziel ist `http://<IP des LinkSync-Servers>:8080`. Pangolin setzt `X-Forwarded-For` selbst, `TRUST_PROXY=true` passt.

**Direkt über die interne IP** (z. B. `http://10.0.0.5:8080`, ohne Proxy): Dafür in `/etc/linksync/linksync.env` `HOST=0.0.0.0` setzen. Die Verbindung ist dann unverschlüsselt – die Lesezeichen bleiben zwar verschlüsselt, das Anmelde-Token aber nicht. Nur im vertrauenswürdigen Heimnetz verwenden.

## Öffentlicher Betrieb – Checkliste

- [ ] HTTPS aktiv (ohne HTTPS könnten Anmelde-Tokens mitgelesen werden)
- [ ] Reverse-Proxy setzt `X-Forwarded-For`, `TRUST_PROXY=true`
- [ ] Datenschutzerklärung ausgefüllt ([DATENSCHUTZ.md](DATENSCHUTZ.md))
- [ ] Entscheidung zu `DELETE_INACTIVE_AFTER_DAYS` getroffen und dokumentiert
- [ ] Regelmässiges Backup des Volumes eingerichtet
- [ ] Zugriffsprotokolle des Proxys: Aufbewahrungsdauer festgelegt

## Lokal entwickeln

```bash
pnpm server                                   # Server auf http://localhost:8080 (ohne Begrenzungen)
pnpm --filter @linksync/server smoke          # Rauchtest gegen den laufenden Server
docker compose -f compose.dev.yaml up --build # Image aus dem Quellcode bauen und starten
```
