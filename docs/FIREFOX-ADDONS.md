# Veröffentlichung auf Firefox Add-ons (addons.mozilla.org)

## Vorbereitung (einmalig)

1. Konto anlegen: https://addons.mozilla.org → *Anmelden* (Mozilla-Konto).
2. Datenschutzerklärung ausfüllen: [DATENSCHUTZ.md](DATENSCHUTZ.md) / [PRIVACY.md](PRIVACY.md) – alle `[ … ]`-Stellen.

Die Erweiterung hat **keinen voreingestellten Server**: Nutzer tragen die Adresse ihres eigenen (oder eines vertrauten) LinkSync-Servers selbst ein.

## Pakete bauen

```bash
pnpm --filter @linksync/extension zip:firefox
```

Ergebnis in `apps/extension/.output/`:

| Datei | Wofür |
|---|---|
| `linksync-<version>-firefox.zip` | die Erweiterung – bei *Add-on hochladen* auswählen |
| `linksync-<version>-sources.zip` | der Quellcode – Mozilla verlangt ihn, weil der Code gebündelt ist |

## Einreichen

https://addons.mozilla.org/developers/addon/submit/distribution

1. **Vertrieb:** *Auf dieser Website* (öffentlich im Store) oder *Selbst verteilen* (nur signiert, per Link installierbar).
2. Erweiterungs-ZIP hochladen.
3. Frage nach Quellcode: *Ja* → Quellcode-ZIP hochladen.
4. Store-Texte unten einfügen.
5. *Hinweise für Prüfer*: Text unten einfügen.

Die Prüfung dauert meist wenige Stunden bis einige Tage.

## Store-Texte

**Name:** LinkSync

**Kategorie:** Lesezeichen (Bookmarks)

**Tags:** bookmarks, sync, encryption, privacy, xbrowsersync

**Homepage:** https://github.com/antaresx999/LinkSync
**Support:** https://github.com/antaresx999/LinkSync/issues

### Deutsch

**Zusammenfassung** (max. 250 Zeichen):
> Synchronisiere deine Lesezeichen zwischen Firefox, Chrome, Edge und Brave über deinen eigenen Server – Ende-zu-Ende verschlüsselt, ohne Konto mit E-Mail. Nachfolger von xBrowserSync.

**Beschreibung:**
> LinkSync hält deine Lesezeichen auf allen Geräten aktuell – und niemand ausser dir kann sie lesen.
>
> **Privat by Design**
> • Verschlüsselung auf deinem Gerät (AES-256-GCM). Der Server sieht nur unlesbare Daten.
> • Kein Konto mit E-Mail: Eine zufällige Sync-ID und dein Passwort genügen.
> • Keine Werbung, kein Tracking, Open Source (GPL-3.0).
>
> **Zuverlässig**
> • Gleichzeitige Änderungen auf mehreren Geräten werden zusammengeführt statt überschrieben.
> • Änderungen, die du bei ausgeschalteter Erweiterung machst, werden erkannt.
> • Sicherungen herunterladen und wieder einspielen.
>
> **Praktisch**
> • Schnelle Suche über alle Lesezeichen direkt im Symbol.
> • Umstieg von xBrowserSync: Lesezeichen direkt vom alten Server oder aus einer Sicherungsdatei übernehmen.
> • Läuft mit deinem eigenen Server: Installation unter Linux mit einem Befehl oder als Docker-Container. Anleitung: https://github.com/antaresx999/LinkSync/blob/main/docs/SERVER.md

### English

**Summary** (max 250 characters):
> Sync your bookmarks between Firefox, Chrome, Edge and Brave via your own server – end-to-end encrypted, no email account needed. Successor to xBrowserSync.

**Description:**
> LinkSync keeps your bookmarks up to date on all your devices – and nobody but you can read them.
>
> **Private by design**
> • Encrypted on your device (AES-256-GCM). The server only sees unreadable data.
> • No email account: a random sync ID and your password are all you need.
> • No ads, no tracking, open source (GPL-3.0).
>
> **Reliable**
> • Simultaneous changes on several devices are merged instead of overwritten.
> • Changes made while the extension was off are detected.
> • Download and restore backups.
>
> **Handy**
> • Fast search across all bookmarks right from the toolbar icon.
> • Switch from xBrowserSync: import bookmarks directly from your old server or from a backup file.
> • Works with your own server: install on Linux with one command or run it as a Docker container. Guide: https://github.com/antaresx999/LinkSync/blob/main/docs/SERVER.md

## Hinweise für Prüfer (Notes to reviewer)

> LinkSync is a monorepo. The extension is in `apps/extension`, it depends on the workspace package `packages/core` (included in the sources ZIP).
>
> Build requirements: Node.js 24, pnpm 12 (via `corepack enable`), macOS or Linux.
>
> Steps to reproduce the build:
> ```
> corepack enable
> pnpm install --frozen-lockfile
> pnpm --filter @linksync/extension build:firefox
> ```
> Output: `apps/extension/.output/firefox-mv3/`
>
> Permissions: `bookmarks` (core function), `storage` + `unlimitedStorage` (sync state for large bookmark collections), `alarms` (periodic sync every 10 minutes).
> Network: The extension has no built-in server. It only contacts the sync server address the user enters and, only when the user explicitly starts an import, an xBrowserSync server entered by the user.
> To test, start a local sync server from the same sources (Node.js 24 + pnpm):
> ```
> pnpm install --frozen-lockfile
> pnpm server
> ```
> Then open the toolbar popup → "New account" → server `http://localhost:8080` → any password with 10+ characters.
