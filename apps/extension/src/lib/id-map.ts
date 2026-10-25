/**
 * Zuordnung zwischen LinkSync-IDs und den IDs des Browsers.
 *
 * Jeder Browser vergibt eigene IDs für Lesezeichen. LinkSync-IDs sind auf
 * allen Geräten gleich. Diese Tabelle verbindet beide.
 */

export class IdMap {
  private readonly toBrowser = new Map<string, string>();
  private readonly toLinkSync = new Map<string, string>();

  constructor(entries: Iterable<[linkSyncId: string, browserId: string]> = []) {
    for (const [ls, b] of entries) this.set(ls, b);
  }

  set(linkSyncId: string, browserId: string): void {
    this.deleteLinkSync(linkSyncId);
    this.deleteBrowser(browserId);
    this.toBrowser.set(linkSyncId, browserId);
    this.toLinkSync.set(browserId, linkSyncId);
  }

  browserId(linkSyncId: string): string | undefined {
    return this.toBrowser.get(linkSyncId);
  }

  linkSyncId(browserId: string): string | undefined {
    return this.toLinkSync.get(browserId);
  }

  deleteLinkSync(linkSyncId: string): void {
    const b = this.toBrowser.get(linkSyncId);
    if (b !== undefined) this.toLinkSync.delete(b);
    this.toBrowser.delete(linkSyncId);
  }

  deleteBrowser(browserId: string): void {
    const ls = this.toLinkSync.get(browserId);
    if (ls !== undefined) this.toBrowser.delete(ls);
    this.toLinkSync.delete(browserId);
  }

  entries(): [string, string][] {
    return [...this.toBrowser.entries()];
  }

  get size(): number {
    return this.toBrowser.size;
  }
}
