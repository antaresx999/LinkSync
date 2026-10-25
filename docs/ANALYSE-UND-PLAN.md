# LinkSync – Analyse von xBrowserSync und Projektplan

Stand: 25.10.2026

## 1. Was im Original steckt

Beide Repos liegen als Referenz in `reference/` (nur zum Nachschlagen, sie werden nicht Teil von LinkSync).

| Teil | Stand | Technik |
|---|---|---|
| `app` (Erweiterung + Android) | Version 1.8.0. Letzte richtige Entwicklung 2022, im März 2026 nur Abhängigkeits-Updates und Tests von einem Helfer | TypeScript, **AngularJS 1.8** (seit 2022 ohne Support), Webpack, Cordova für Android, rund 19'000 Zeilen Code |
| `api` (Server) | Version 1.1.13, letzter Commit 2021 | Node.js (ab Version 8), Express 4, **MongoDB 3.6 / Mongoose 5** (beide veraltet) |

### So funktioniert der Sync heute
1. Aus Passwort + Sync-ID wird mit PBKDF2 (250'000 Runden) ein Schlüssel erzeugt.
2. Der **komplette Lesezeichenbaum** wird komprimiert, mit AES-GCM verschlüsselt und als ein einziger Textblock hochgeladen.
3. Der Server speichert nur diesen Block plus `lastUpdated`. Er kann nichts lesen.
4. Bei jeder Änderung wird der ganze Block neu hochgeladen.

### Schwachstellen, die LinkSync besser machen soll
- **Manifest V2:** Chrome lädt die Erweiterung nicht mehr.
- **AngularJS:** veraltet, schwer zu warten.
- **Ganzer Block bei jeder Änderung:** Ändern zwei Geräte gleichzeitig etwas, gewinnt eines und die Änderung des anderen geht verloren. Bei vielen Lesezeichen wird es zudem langsam.
- **Keine Schreib-Berechtigung:** Wer die Sync-ID kennt, kann die (verschlüsselten) Daten auf dem Server überschreiben oder löschen. Lesen kann er sie nicht, zerstören schon.
- **Server-Technik veraltet:** MongoDB ist für so wenig Daten ausserdem überdimensioniert.
- **Kein Safari** (siehe unten).

## 2. Architektur von LinkSync

Ein einziges Repository (Monorepo) mit vier Teilen:

```
LinkSync/
├── packages/core/      Gemeinsamer Kern: Datenmodell, Verschlüsselung, Sync-Logik
├── apps/extension/     Browser-Erweiterung (Chrome, Edge, Brave, Firefox)
├── apps/server/        Sync-Server
└── apps/mobile/        Mobile App (später)
```

Der Kern wird einmal geschrieben und von Erweiterung und App gemeinsam genutzt. So muss die schwierige Logik (Verschlüsselung, Zusammenführen von Änderungen) nur einmal stimmen.

### Technik-Auswahl
| Bereich | Wahl | Warum |
|---|---|---|
| Sprache | TypeScript | JavaScript mit Typen: Fehler fallen früher auf. Lässt sich gut lernen |
| Erweiterung | **WXT** + Manifest V3 | Ein Code, Builds für alle Browser |
| Oberfläche | **Svelte** | Am nächsten an klassischem HTML/CSS/JS, am leichtesten lesbar |
| Server | Node.js + **Hono** + **SQLite** | Klein, schnell, eine einzige Datenbankdatei, kein separater Datenbankserver |
| Betrieb | Docker | Ein Befehl zum Selberhosten |
| Mobile | Capacitor (iOS + Android) | Kann die Svelte-Oberfläche weiterverwenden |
| Tests | Vitest | Schnell, einfach |

### Neues Sync-Protokoll (Entwurf)
- **Einzelne Einträge statt eines Blocks:** Jedes Lesezeichen und jeder Ordner bekommt eine feste ID und wird einzeln verschlüsselt gespeichert.
- **Versionsnummern:** Der Server zählt jede Änderung hoch. Ein Gerät fragt: „Gib mir alles seit Version 1234." So werden nur Änderungen übertragen.
- **Zusammenführen statt Überschreiben:** Ändern zwei Geräte unterschiedliche Lesezeichen, bleiben beide Änderungen erhalten.
- **Zwei Schlüssel aus einem Passwort:**
  - ein *Verschlüsselungsschlüssel*, der das Gerät nie verlässt
  - ein *Anmeldeschlüssel*, mit dem der Server prüft, ob ein Gerät schreiben darf. Daraus kann der Server den Verschlüsselungsschlüssel nicht ableiten
- **Weiterhin Ende-zu-Ende verschlüsselt:** Der Server sieht nur IDs, Versionsnummern und verschlüsselte Daten.
- **Import:** Bestehende xBrowserSync-Daten lassen sich einmalig übernehmen (Export-Datei).

## 3. Browser-Unterstützung

| Browser | Machbar? | Bemerkung |
|---|---|---|
| Chrome, Edge, Brave, Opera | ✅ | Ein Build. Chrome Web Store kostet einmalig 5 USD |
| Firefox | ✅ | Eigener Build, Veröffentlichung kostenlos |
| Safari (macOS/iOS) | ⚠️ | Safari-Erweiterungen dürfen **nicht auf Lesezeichen zugreifen**. Möglich wären nur „Lesezeichen in LinkSync suchen und öffnen" sowie eine Leseliste, kein echter Sync. Dafür nötig: Xcode + Apple-Developer-Account (99 USD/Jahr) |
| Mobile | ⚠️ | Mobile Browser erlauben keinen Lesezeichen-Zugriff. Die App wird deshalb ein eigener Lesezeichen-Manager (wie früher die Android-App von xBrowserSync) mit „Teilen → LinkSync" |

## 4. Fahrplan

| Phase | Inhalt | Ergebnis |
|---|---|---|
| 0 | Entwicklungsumgebung: Node.js installieren, GitHub-Repo anlegen | Projekt startet |
| 1 | Kern: Datenmodell, Verschlüsselung, Sync-Logik mit Tests | Herzstück steht und ist geprüft |
| 2 | Server: API, Datenbank, Docker | Läuft lokal bei dir |
| 3 | Erweiterung für Chrome + Firefox: Einrichten, Sync, Einstellungen | **Erste nutzbare Version** |
| 4 | Feinschliff: Suche, Backup/Restore, xBrowserSync-Import, Übersetzungen (DE/EN) | Alltagstauglich |
| 5 | Veröffentlichung in den Stores, Server hosten | Öffentlich nutzbar |
| 6 | Mobile App (iOS/Android) | Optional |
| 7 | Safari (eingeschränkt) | Optional |

## 5. Arbeitsweise
- Ich schreibe den Code und erkläre bei jedem Schritt in einfachen Worten, was er tut und wie du ihn testest.
- Du probierst die Ergebnisse im Browser aus und entscheidest über Funktionen und Aussehen.
- Jede Phase endet mit etwas, das du selbst starten und anfassen kannst.

## 6. Rechtliches
- xBrowserSync steht unter **GPL-3.0**. LinkSync übernimmt diese Lizenz und nennt xBrowserSync als Ursprung.
- Da wir neu schreiben statt den alten Code umzubauen, empfiehlt sich ein **neues Repository** statt eines GitHub-Forks. Ein Fork würde 19'000 Zeilen AngularJS-Altlast mitschleppen.
