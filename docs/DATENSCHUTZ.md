# Datenschutzerklärung LinkSync

*English version: [PRIVACY.md](PRIVACY.md)*

Stand: 25.10.2026

## 1. Verantwortlich

Andreas Franz
E-Mail: andreas.franz@bluemail.ch

verantwortlich für die Browser-Erweiterung LinkSync.

Die Erweiterung hat **keinen voreingestellten Server** und der Entwickler betreibt keinen Server für Nutzer. Die Erweiterung überträgt Daten nur an den Server, dessen Adresse du selbst einträgst. Für die Daten auf diesem Server ist dessen Betreiber verantwortlich – bei einem eigenen Server also du selbst.

## 2. Grundsatz: Ende-zu-Ende-Verschlüsselung

LinkSync verschlüsselt deine Lesezeichen **auf deinem Gerät**, bevor sie den Browser verlassen. Der Schlüssel wird aus deinem Passwort abgeleitet. Das Passwort und der Schlüssel werden **nie** an den Server übertragen. Der Betreiber eines Servers kann deine Lesezeichen deshalb nicht lesen.

## 3. Was die Browser-Erweiterung verarbeitet

- **Lesezeichen** (Titel, Adresse, Ordnerstruktur): lokal im Browser; verschlüsselt an den von dir eingetragenen Server.
- **Einstellungen und Sync-Zustand** (Server-Adresse, Sync-ID, Anmelde-Token, Verschlüsselungsschlüssel): nur lokal im Speicher der Erweiterung. Der Schlüssel ist als nicht exportierbarer Schlüssel abgelegt.
- **Sicherung vor dem Verbinden:** Beim Verbinden mit einem bestehenden Konto wird eine Kopie der bisherigen Lesezeichen lokal in der Erweiterung gespeichert.
- **Umstieg von xBrowserSync:** Nur wenn du es auslöst, ruft die Erweiterung deine verschlüsselten Daten vom angegebenen xBrowserSync-Server ab und entschlüsselt sie lokal.

Die Erweiterung enthält **keine** Werbung, **keine** Statistik- oder Analysewerkzeuge und überträgt keine Daten an den Entwickler oder an Dritte.

## 4. Was ein LinkSync-Server speichert

Die Server-Software (ebenfalls Open Source) speichert:

| Daten | Zweck |
|---|---|
| Sync-ID (zufällige Kennung) | Zuordnung der Daten zu deinem Konto |
| Hash des Anmelde-Tokens | Prüfen, ob ein Gerät schreiben darf |
| Verschlüsselte Einträge mit Versionsnummer | Synchronisation |
| Zeitpunkt der Erstellung und letzten Nutzung | Betrieb, ggf. Aufräumen unbenutzter Konten |

Aus dem Anmelde-Token lässt sich weder das Passwort noch der Verschlüsselungsschlüssel ableiten. IP-Adressen verwendet die Server-Software nur kurzzeitig im Arbeitsspeicher, um Missbrauch zu begrenzen; sie speichert sie nicht. Angaben zu Protokollen, Löschfristen und Standort macht der Betreiber des jeweiligen Servers.

## 5. Rechtsgrundlage

Verarbeitung zur Erbringung der von dir gewünschten Funktion (Art. 6 Abs. 1 lit. b DSGVO) bzw. im Rahmen des Schweizer Datenschutzgesetzes (DSG).

## 6. Deine Rechte und Löschung

- **Daten auf dem Server löschen:** In der Erweiterung unter *Sicherung & Import → Konto löschen* werden dein Konto und alle Daten sofort vom Server entfernt.
- **Lokale Daten löschen:** *Verbindung trennen* oder die Erweiterung entfernen.
- Du hast das Recht auf Auskunft, Berichtigung, Löschung und Beschwerde bei einer Datenschutzaufsicht (in der Schweiz: EDÖB). Fragen zur Erweiterung an: andreas.franz@bluemail.ch

## 7. Quellcode

LinkSync ist Open Source (GPL-3.0). Die hier beschriebenen Eigenschaften lassen sich im Quellcode überprüfen: https://github.com/antaresx999/LinkSync
