# LinkSync-Erweiterung

## Ausprobieren in Firefox

1. Server starten (Terminal 1):
   ```bash
   pnpm server
   ```
2. Erweiterung starten (Terminal 2):
   ```bash
   pnpm firefox
   ```
   Es öffnet sich ein **separates** Firefox-Fenster mit einem frischen Testprofil und installierter Erweiterung. Dein normales Firefox-Profil bleibt unberührt. Beim Schliessen wird das Testprofil verworfen – beim nächsten Start einfach mit *Verbinden* und Sync-ID wieder anmelden.
3. Auf das LinkSync-Symbol in der Symbolleiste klicken (evtl. über das Puzzle-Symbol ✱ anheften).
4. **Neues Konto** → Passwort zweimal eingeben → *Konto anlegen*.
5. Sync-ID kopieren und in einem zweiten Browser mit **Verbinden** verwenden.

## Ausprobieren in Chrome, Edge oder Brave

```bash
pnpm --filter @linksync/extension build
```

Dann im Browser `chrome://extensions` öffnen → *Entwicklermodus* einschalten → *Entpackte Erweiterung laden* → Ordner `apps/extension/.output/chrome-mv3` wählen.

## Funktionen

- **Suche:** Im Popup oben ins Suchfeld tippen. Pfeiltasten + Enter öffnen ein Lesezeichen in einem neuen Tab. Gesucht wird in Titel und Adresse aller synchronisierten Lesezeichen – auch in denen, die dieser Browser nicht anzeigt (z. B. Firefox-Menü in Chrome).
- **Sicherung & Import** (Link unten im Popup):
  - *Sicherung herunterladen*: alle Lesezeichen als JSON-Datei (unverschlüsselt).
  - *Sicherung einspielen*: LinkSync- oder xBrowserSync-Sicherungsdatei, wahlweise zusätzlich übernehmen oder alles ersetzen.
  - *Von xBrowserSync umsteigen*: Lesezeichen direkt vom bisherigen xBrowserSync-Server holen (Sync-ID + Passwort). Beschreibungen, Tags und Trennlinien fallen weg.
  - *Lesezeichen vor dem Verbinden*: die beim Verbinden ersetzten Lesezeichen zusätzlich übernehmen.
- **Sprache:** Deutsch oder Englisch, je nach Sprache des Browsers.

## Wie es funktioniert

| Wann wird synchronisiert? | |
|---|---|
| Lesezeichen geändert | nach 3 Sekunden Ruhe |
| Browser gestartet | sofort |
| Regelmässig | alle 10 Minuten |
| Von Hand | „Jetzt synchronisieren" im Popup |

Ein Sync-Durchgang: Browser mit LinkSync vergleichen → mit Server abgleichen → Browser anpassen. Weil jedes Mal der ganze Browser verglichen wird, gehen auch Änderungen nicht verloren, die bei ausgeschalteter Erweiterung gemacht wurden.

**Beim Verbinden mit einem bestehenden Konto** werden die Lesezeichen dieses Browsers durch die synchronisierten ersetzt. Vorher wird eine Sicherung im Speicher der Erweiterung abgelegt; sie lässt sich unter *Sicherung & Import* zusätzlich übernehmen.

## Einschränkungen

- **Chrome hat kein Lesezeichenmenü.** Lesezeichen aus dem Firefox-Menü bleiben erhalten, erscheinen in Chrome aber nicht.
- **Trennlinien** (nur Firefox) werden nicht synchronisiert und können nach einem Sync an das Ende eines Ordners rutschen.
- **Firefox-Abfragen** wie „Meistbesucht" (`place:`-Adressen) werden nicht synchronisiert.

## Tests

```bash
pnpm --filter @linksync/extension test          # Abgleich mit simuliertem Chrome/Firefox
pnpm --filter @linksync/extension e2e:firefox   # zwei echte Firefox-Instanzen inkl. Suche und xBrowserSync-Übernahme (Server muss laufen)
```
