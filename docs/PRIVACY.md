# LinkSync Privacy Policy

*Deutsche Version: [DATENSCHUTZ.md](DATENSCHUTZ.md)*

Last updated: 25 October 2026

## 1. Controller

Andreas Franz
Email: andreas.franz@bluemail.ch

responsible for the LinkSync browser extension.

The extension has **no built-in server** and the developer does not operate a server for users. The extension only sends data to the server whose address you enter yourself. The operator of that server is responsible for the data stored there – for your own server, that is you.

## 2. Principle: end-to-end encryption

LinkSync encrypts your bookmarks **on your device** before they leave the browser. The key is derived from your password. Neither the password nor the key is **ever** sent to the server. A server operator therefore cannot read your bookmarks.

## 3. What the browser extension processes

- **Bookmarks** (title, address, folder structure): locally in the browser; encrypted to the server you entered.
- **Settings and sync state** (server address, sync ID, auth token, encryption key): only locally in the extension's storage. The key is stored as a non-exportable key.
- **Backup before connecting:** When connecting to an existing account, a copy of the previous bookmarks is stored locally in the extension.
- **Switching from xBrowserSync:** Only when you trigger it, the extension fetches your encrypted data from the xBrowserSync server you specify and decrypts it locally.

The extension contains **no** advertising, **no** analytics or tracking, and sends no data to the developer or to third parties.

## 4. What a LinkSync server stores

The server software (also open source) stores:

| Data | Purpose |
|---|---|
| Sync ID (random identifier) | Linking data to your account |
| Hash of the auth token | Checking whether a device may write |
| Encrypted entries with version number | Synchronisation |
| Time of creation and last use | Operation, optional clean-up of unused accounts |

Neither the password nor the encryption key can be derived from the auth token. The server software uses IP addresses only briefly in memory to limit abuse; it does not store them. Information on logs, retention and location is provided by the operator of the respective server.

## 5. Legal basis

Processing to provide the function you requested (Art. 6(1)(b) GDPR) and under the Swiss Federal Act on Data Protection (FADP).

## 6. Your rights and deletion

- **Delete data on the server:** In the extension under *Backup & import → Delete account*, your account and all data are removed from the server immediately.
- **Delete local data:** *Disconnect* or remove the extension.
- You have the right to access, rectification, erasure, and to lodge a complaint with a data protection authority. Questions about the extension: andreas.franz@bluemail.ch

## 7. Source code

LinkSync is open source (GPL-3.0). The properties described here can be verified in the source code: https://github.com/antaresx999/LinkSync
