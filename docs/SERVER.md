# LinkSync-Server betreiben

Der Server speichert nur verschlüsselte Daten. Selbst wer Zugriff auf die Datenbank hat, kann keine Lesezeichen lesen.

## Auf deinem Server (Docker)

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

### 2a. Variante A – du hast schon einen Reverse-Proxy

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

### 2b. Variante B – kein Reverse-Proxy vorhanden

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

## Einstellungen (in `.env`)

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
| `PORT` | `8080` | Port im Container |
| `DATABASE_PATH` | `/data/linksync.sqlite` | Pfad zur Datenbank im Container |

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
