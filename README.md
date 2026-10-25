# LinkSync

Ende-zu-Ende verschlüsselter Lesezeichen-Sync für Chrome, Edge, Brave, Firefox und mehr.
Deine Lesezeichen werden auf deinem Gerät verschlüsselt. Der Server sieht nie, was du speicherst.

> **Status:** Frühe Entwicklung. Erste Version der Erweiterung läuft lokal, noch nicht in den Stores.

## Herkunft

LinkSync ist eine Neuentwicklung inspiriert von [xBrowserSync](https://github.com/xbrowsersync),
dessen Entwicklung eingestellt wurde. Danke an das xBrowserSync-Team für die Grundidee.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `packages/core` | Gemeinsamer Kern: Datenmodell, Verschlüsselung, Sync-Logik |
| `apps/extension` | Browser-Erweiterung für Firefox, Chrome, Edge, Brave, siehe [docs/ERWEITERUNG.md](docs/ERWEITERUNG.md) |
| `apps/server` | Sync-Server, siehe [docs/SERVER.md](docs/SERVER.md) |
| `docs` | Planung und Dokumentation |

Plan und Hintergründe: [docs/ANALYSE-UND-PLAN.md](docs/ANALYSE-UND-PLAN.md)
Sync-Protokoll: [docs/PROTOKOLL.md](docs/PROTOKOLL.md)

## Entwickeln

Voraussetzung: Node.js 24 oder neuer.

```bash
corepack enable   # aktiviert pnpm (einmalig)
pnpm install      # Abhängigkeiten installieren
pnpm test         # alle Tests ausführen
pnpm server       # Server lokal starten (http://localhost:8080)
pnpm firefox      # Erweiterung in einem separaten Firefox ausprobieren
```

## Lizenz

GPL-3.0, siehe [LICENSE](LICENSE).
