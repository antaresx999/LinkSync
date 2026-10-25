# LinkSync Privacy Policy

*Deutsche Version: [DATENSCHUTZ.md](DATENSCHUTZ.md)*

Last updated: [DATE]

> **Note for the operator:** Fill in everything in square brackets [ … ] before publishing. This policy describes how the software behaves; it is not legal advice.

## 1. Controller

[NAME / COMPANY]
[ADDRESS]
[EMAIL]

responsible for the sync server at **[DOMAIN]**.

If you use LinkSync with your own or another server, contact that server's operator.

## 2. Principle: end-to-end encryption

LinkSync encrypts your bookmarks **on your device** before they leave the browser. The key is derived from your password. Neither the password nor the key is **ever** sent to the server. The operator therefore cannot read your bookmarks – not even if ordered to by authorities.

## 3. What the browser extension processes

- **Bookmarks** (title, address, folder structure): locally in the browser; encrypted to the server you choose.
- **Settings and sync state** (server address, sync ID, auth token, encryption key): only locally in the extension's storage. The key is stored as a non-exportable key.
- **Backup before connecting:** When connecting to an existing account, a copy of the previous bookmarks is stored locally in the extension.
- **Switching from xBrowserSync:** Only when you trigger it, the extension fetches your encrypted data from the xBrowserSync server you specify and decrypts it locally.

The extension contains **no** advertising, **no** analytics or tracking, and sends no data to third parties.

## 4. What the sync server stores

| Data | Purpose | Retention |
|---|---|---|
| Sync ID (random identifier) | Linking data to your account | until the account is deleted |
| Hash of the auth token | Checking whether a device may write | until the account is deleted |
| Encrypted entries with version number | Synchronisation | until the account is deleted or the entry changes |
| Time of creation and last use | Operation, optional clean-up of unused accounts | until the account is deleted |

Neither the password nor the encryption key can be derived from the auth token.

**IP addresses** are used by the LinkSync server only briefly in memory to limit abuse (requests per minute, new accounts per hour). They are not stored.
[IF APPLICABLE: The web server/reverse proxy in front logs requests including IP addresses for [NUMBER] days for troubleshooting and attack prevention.]

[IF DELETE_INACTIVE_AFTER_DAYS IS SET: Accounts not used for [NUMBER] days are deleted automatically.]

## 5. Legal basis

Processing to provide the service you requested (Art. 6(1)(b) GDPR) and under the Swiss Federal Act on Data Protection (FADP); abuse prevention based on legitimate interest (Art. 6(1)(f) GDPR).

## 6. Your rights and deletion

- **Delete yourself:** In the extension under *Backup & import → Delete account*, your account and all data are removed from the server immediately.
- You have the right to access, rectification, erasure, and to lodge a complaint with a data protection authority.
- As the operator cannot decrypt your data, information can only be given about the data listed in section 4.

## 7. Hosting

The server is hosted at [PROVIDER / OWN SERVER], location [COUNTRY].

## 8. Source code

LinkSync is open source (GPL-3.0). The properties described here can be verified in the source code: https://github.com/antaresx999/LinkSync
