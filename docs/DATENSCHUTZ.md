# Datenschutzerklärung LinkSync

*English version: [PRIVACY.md](PRIVACY.md)*

Stand: [DATUM]

> **Hinweis für den Betreiber:** Alle Stellen in eckigen Klammern [ … ] vor der Veröffentlichung ausfüllen. Die Erklärung beschreibt das Verhalten der Software; sie ist keine Rechtsberatung.

## 1. Verantwortlich

[NAME / FIRMA]
[ADRESSE]
[E-MAIL]

verantwortlich für den Sync-Server unter **[DOMAIN]**.

Wer LinkSync mit einem eigenen oder fremden Server nutzt, wendet sich an dessen Betreiber.

## 2. Grundsatz: Ende-zu-Ende-Verschlüsselung

LinkSync verschlüsselt deine Lesezeichen **auf deinem Gerät**, bevor sie den Browser verlassen. Der Schlüssel wird aus deinem Passwort abgeleitet. Das Passwort und der Schlüssel werden **nie** an den Server übertragen. Der Betreiber kann deine Lesezeichen deshalb nicht lesen – auch nicht auf behördliche Anordnung.

## 3. Was die Browser-Erweiterung verarbeitet

- **Lesezeichen** (Titel, Adresse, Ordnerstruktur): lokal im Browser; verschlüsselt an den von dir gewählten Server.
- **Einstellungen und Sync-Zustand** (Server-Adresse, Sync-ID, Anmelde-Token, Verschlüsselungsschlüssel): nur lokal im Speicher der Erweiterung. Der Schlüssel ist als nicht exportierbarer Schlüssel abgelegt.
- **Sicherung vor dem Verbinden:** Beim Verbinden mit einem bestehenden Konto wird eine Kopie der bisherigen Lesezeichen lokal in der Erweiterung gespeichert.
- **Umstieg von xBrowserSync:** Nur wenn du es auslöst, ruft die Erweiterung deine verschlüsselten Daten vom angegebenen xBrowserSync-Server ab und entschlüsselt sie lokal.

Die Erweiterung enthält **keine** Werbung, **keine** Statistik- oder Analysewerkzeuge und überträgt keine Daten an Dritte.

## 4. Was der Sync-Server speichert

| Daten | Zweck | Speicherdauer |
|---|---|---|
| Sync-ID (zufällige Kennung) | Zuordnung der Daten zu deinem Konto | bis zur Löschung des Kontos |
| Hash des Anmelde-Tokens | Prüfen, ob ein Gerät schreiben darf | bis zur Löschung des Kontos |
| Verschlüsselte Einträge mit Versionsnummer | Synchronisation | bis zur Löschung des Kontos bzw. bis zur nächsten Änderung |
| Zeitpunkt der Erstellung und letzten Nutzung | Betrieb, ggf. Aufräumen unbenutzter Konten | bis zur Löschung des Kontos |

Aus dem Anmelde-Token lässt sich weder das Passwort noch der Verschlüsselungsschlüssel ableiten.

**IP-Adressen** verwendet der LinkSync-Server nur kurzzeitig im Arbeitsspeicher, um Missbrauch zu begrenzen (Anfragen pro Minute, neue Konten pro Stunde). Er speichert sie nicht.
[FALLS ZUTREFFEND: Der vorgeschaltete Webserver/Reverse-Proxy protokolliert Zugriffe inklusive IP-Adresse für [ANZAHL] Tage zur Fehlersuche und Abwehr von Angriffen.]

[FALLS DELETE_INACTIVE_AFTER_DAYS GESETZT: Konten, die [ANZAHL] Tage nicht benutzt wurden, werden automatisch gelöscht.]

## 5. Rechtsgrundlage

Verarbeitung zur Erbringung des von dir gewünschten Dienstes (Art. 6 Abs. 1 lit. b DSGVO) bzw. im Rahmen des Schweizer Datenschutzgesetzes (DSG); Missbrauchsabwehr aufgrund berechtigten Interesses (Art. 6 Abs. 1 lit. f DSGVO).

## 6. Deine Rechte und Löschung

- **Selbst löschen:** In der Erweiterung unter *Sicherung & Import → Konto löschen* werden dein Konto und alle Daten sofort vom Server entfernt.
- Du hast das Recht auf Auskunft, Berichtigung, Löschung und Beschwerde bei einer Datenschutzaufsicht (in der Schweiz: EDÖB).
- Da der Betreiber deine Daten nicht entschlüsseln kann, kann er Auskunft nur über die in Abschnitt 4 genannten Daten geben.

## 7. Hosting

Der Server wird betrieben bei [ANBIETER / EIGENER SERVER], Standort [LAND].

## 8. Quellcode

LinkSync ist Open Source (GPL-3.0). Die hier beschriebenen Eigenschaften lassen sich im Quellcode überprüfen: https://github.com/antaresx999/LinkSync
