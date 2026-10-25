/**
 * Der Teil der Browser-Schnittstelle für Lesezeichen, den LinkSync braucht.
 * Chrome und Firefox bieten ihn als `browser.bookmarks` an. Für Tests gibt
 * es eine Nachbildung (fake-bookmarks.ts).
 */

import { isRootId, type RootId } from '@linksync/core';

export interface BrowserNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  /** Nur Firefox: "bookmark", "folder" oder "separator" (Trennlinie). */
  type?: 'bookmark' | 'folder' | 'separator';
  /** Nur Chrome: Art der Hauptordner. */
  folderType?: string;
  /** Von der Firma verwaltete Lesezeichen (nur Chrome) – nicht änderbar. */
  unmodifiable?: string;
  children?: BrowserNode[];
}

export interface BookmarksApi {
  getTree(): Promise<BrowserNode[]>;
  getChildren(id: string): Promise<BrowserNode[]>;
  create(details: { parentId: string; index?: number; title?: string; url?: string }): Promise<BrowserNode>;
  update(id: string, changes: { title?: string; url?: string }): Promise<BrowserNode>;
  move(id: string, destination: { parentId?: string; index?: number }): Promise<BrowserNode>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
}

/** Feste Firefox-IDs der Hauptordner. */
const FIREFOX_ROOTS: Record<string, RootId> = {
  toolbar_____: 'toolbar',
  menu________: 'menu',
  unfiled_____: 'other',
  mobile______: 'mobile',
};

/** Chrome-Ordnerarten (ab Chrome 134). */
const CHROME_FOLDER_TYPES: Record<string, RootId> = {
  'bookmarks-bar': 'toolbar',
  other: 'other',
  mobile: 'mobile',
};

/** Klassische Chrome-IDs, falls folderType fehlt. */
const CHROME_LEGACY_IDS: Record<string, RootId> = { '1': 'toolbar', '2': 'other', '3': 'mobile' };

/** Welcher Browser-Ordner entspricht welchem LinkSync-Hauptordner? */
export function detectRoots(tree: BrowserNode[]): Map<RootId, string> {
  const roots = new Map<RootId, string>();
  for (const node of tree[0]?.children ?? []) {
    const root =
      FIREFOX_ROOTS[node.id] ??
      (node.folderType ? CHROME_FOLDER_TYPES[node.folderType] : CHROME_LEGACY_IDS[node.id]);
    if (root && isRootId(root) && !roots.has(root)) roots.set(root, node.id);
  }
  return roots;
}

export function isFolder(node: BrowserNode): boolean {
  return node.type ? node.type === 'folder' : node.url === undefined;
}

/** Wird dieser Knoten synchronisiert? Trennlinien und verwaltete Lesezeichen nicht. */
export function isSyncable(node: BrowserNode): boolean {
  if (node.type === 'separator' || node.unmodifiable) return false;
  // Firefox-interne Abfragen ("Meistbesucht" usw.) funktionieren in anderen Browsern nicht.
  if (node.url?.startsWith('place:')) return false;
  return true;
}
