# LinkSync-Protokoll, Version 1

Diese Datei beschreibt, wie Geräte und Server zusammenarbeiten. Der Code dazu liegt in `packages/core/src/`.

## Grundidee

- Der Server ist ein **dummer, verschlüsselter Speicher**. Er kennt keine Lesezeichen, nur IDs, Nummern und unlesbare Daten.
- Die gesamte Intelligenz (Zusammenführen, Konflikte lösen) steckt im Gerät.
- Ein Konto besteht aus einer **Sync-ID** (zufällige UUID, nicht geheim) und einem **Passwort** (geheim, verlässt nie das Gerät).

## Schlüssel (`crypto.ts`)

```
Passwort + Sync-ID ──PBKDF2-SHA256, 600'000 Runden──▶ Hauptschlüssel
Hauptschlüssel ──HKDF "linksync/v1/encryption"──▶ AES-256-GCM-Schlüssel (bleibt auf dem Gerät)
Hauptschlüssel ──HKDF "linksync/v1/auth"────────▶ Anmelde-Token (geht an den Server)
```

- Der Server speichert nur `SHA-256(Anmelde-Token)`.
- Wer das Passwort nicht kennt, kann weder lesen noch schreiben. Im alten xBrowserSync reichte die Sync-ID zum Überschreiben.
- Das Salz enthält die Sync-ID, deshalb ergibt dasselbe Passwort in zwei Konten verschiedene Schlüssel.

## Einträge (`model.ts`, `record.ts`)

Jedes Lesezeichen und jeder Ordner ist ein eigener Eintrag:

| Feld | Bedeutung |
|---|---|
| `kind` | `bookmark` oder `folder` |
| `parentId` | Elternordner oder Hauptordner (`toolbar`, `menu`, `other`, `mobile`) |
| `title`, `url` | Inhalt |
| `position` | Sortierschlüssel (Text). Zwischen zwei Schlüssel passt immer ein neuer |
| `deleted` | Gelöschte Einträge bleiben als „Grabstein", damit alle Geräte davon erfahren |

**Jedes Feld hat einen eigenen Zeitstempel** (hybride logische Uhr, `clock.ts`). Beim Zusammenführen gewinnt pro Feld der neuere Stempel. Das Ergebnis ist auf allen Geräten gleich, egal in welcher Reihenfolge die Daten eintreffen.

### Verschlüsselung eines Eintrags
- Inhalt: der Eintrag als JSON.
- Verfahren: AES-256-GCM mit zufälligem 12-Byte-IV.
- Zusätzlich authentifizierte Daten: `linksync/v1/record/<id>`. Vertauscht der Server Einträge, fällt das auf.
- Format: `1.<Base64url(IV ‖ Geheimtext)>`

## Widersprüche im Baum (`tree.ts`)

| Situation | Auflösung |
|---|---|
| Elternordner gelöscht, Kind lebt noch | Kind erscheint in „Weitere Lesezeichen" |
| Zwei Ordner gleichzeitig ineinander verschoben | Der Ordner mit der kleineren ID kommt nach „Weitere Lesezeichen" |
| Zwei Einträge mit gleichem Sortierschlüssel | Sortierung nach ID |

## Server-Schnittstelle (`protocol.ts`)

Anmeldung bei jedem Aufruf mit `Authorization: Bearer <Anmelde-Token>`.

| Aufruf | Zweck |
|---|---|
| `POST /v1/accounts` `{ syncId, authTokenHash }` | Konto anlegen |
| `GET /v1/accounts/:syncId/records?since=<seq>&limit=<n>` | Änderungen seit `seq` abholen |
| `POST /v1/accounts/:syncId/records` `{ records: [{ id, baseSeq, data }] }` | Änderungen hochladen |
| `DELETE /v1/accounts/:syncId` | Konto mit allen Daten löschen |

- Der Server vergibt pro Konto eine fortlaufende Nummer `seq` für jede gespeicherte Fassung.
- Beim Hochladen nennt das Gerät mit `baseSeq` die Fassung, die es zuletzt kannte. Hat der Server inzwischen eine neuere, meldet er einen **Konflikt**. Das Gerät holt dann ab, führt zusammen und lädt erneut hoch.
- Grenzen: höchstens 500 Einträge pro Upload und 16 KB pro Eintrag.

## Sync-Ablauf (`sync.ts`)

1. Abholen: seitenweise alles seit `lastSeq`, entschlüsseln, zusammenführen.
2. Hochladen: alle lokal geänderten Einträge, in Paketen zu 500.
3. Bei Konflikten wieder bei 1 beginnen (höchstens 5 Runden).

Das Gerät speichert dazu: alle Einträge, die Liste der noch nicht hochgeladenen IDs, `lastSeq`, die `seq` je Eintrag und den Zustand der Uhr.

## Bekannte Grenzen (bewusst, für später)
- Grabsteine werden nie entfernt. Bei sehr vielen Löschungen wächst der Speicher langsam.
- Passwort ändern ist noch nicht vorgesehen. Später: alle Einträge neu verschlüsseln und das Token wechseln.
