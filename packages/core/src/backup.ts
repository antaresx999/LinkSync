/**
 * Sicherungen: Lesezeichen als Datei speichern und wieder einspielen.
 *
 * Alle Import-Quellen (LinkSync-Sicherung, xBrowserSync, Browser-Sicherung)
 * werden zuerst in dieselbe einfache Form gebracht (ImportRoots) und dann
 * mit importIntoTree in den LinkSync-Baum übernommen.
 */

import { ROOT_IDS, type RootId } from './model';
import type { BookmarkTree, TreeNode } from './tree';

/** Ein Lesezeichen (mit url) oder ein Ordner (mit children). */
export interface ImportNode {
  title: string;
  url?: string;
  children?: ImportNode[];
}

export type ImportRoots = Partial<Record<RootId, ImportNode[]>>;

export interface LinkSyncBackup {
  format: 'linksync-backup';
  version: 1;
  createdAt: string;
  roots: Record<RootId, ImportNode[]>;
}

export interface ImportResult {
  bookmarks: number;
  folders: number;
  /** Übersprungen, weil die Adresse schon vorhanden war (nur beim Zusammenführen). */
  skipped: number;
}

/** Sicherung des aktuellen Baums erstellen. */
export function createBackup(tree: BookmarkTree, now = new Date()): LinkSyncBackup {
  const convert = (nodes: TreeNode[]): ImportNode[] =>
    nodes.map((n) => (n.kind === 'bookmark' ? { title: n.title, url: n.url } : { title: n.title, children: convert(n.children) }));
  const roots = {} as Record<RootId, ImportNode[]>;
  for (const root of tree.toTree()) roots[root.id] = convert(root.children);
  return { format: 'linksync-backup', version: 1, createdAt: now.toISOString(), roots };
}

/**
 * Lesezeichen in den Baum übernehmen.
 *  - replace: true  → alles Bisherige wird gelöscht und durch den Import ersetzt.
 *  - replace: false → der Import wird angehängt; Adressen, die es schon gibt, werden übersprungen.
 */
export function importIntoTree(tree: BookmarkTree, roots: ImportRoots, options: { replace: boolean }): ImportResult {
  const result: ImportResult = { bookmarks: 0, folders: 0, skipped: 0 };
  const known = new Set<string>();

  if (options.replace) {
    for (const root of ROOT_IDS) for (const id of tree.childIds(root)) tree.remove(id);
  } else {
    for (const r of tree.allRecords()) {
      if (r.fields.url && tree.exists(r.id)) known.add(r.fields.url);
    }
  }

  const add = (parentId: string, nodes: ImportNode[]) => {
    for (const node of nodes) {
      if (node.url !== undefined) {
        if (!options.replace && known.has(node.url)) {
          result.skipped++;
          continue;
        }
        known.add(node.url);
        tree.addBookmark(parentId, node.title, node.url);
        result.bookmarks++;
      } else {
        const folderId = tree.addFolder(parentId, node.title);
        result.folders++;
        add(folderId, node.children ?? []);
      }
    }
  };
  for (const root of ROOT_IDS) add(root, roots[root] ?? []);
  return result;
}

export class UnsupportedFileError extends Error {
  constructor() {
    super('Unbekanntes Dateiformat. Erwartet wird eine LinkSync- oder xBrowserSync-Sicherung.');
    this.name = 'UnsupportedFileError';
  }
}

/** Prüft eine LinkSync-Sicherung und gibt ihren Inhalt zurück. */
export function parseLinkSyncBackup(data: unknown): ImportRoots | null {
  if (!isObject(data) || data.format !== 'linksync-backup' || !isObject(data.roots)) return null;
  const roots: ImportRoots = {};
  for (const root of ROOT_IDS) {
    const nodes = data.roots[root];
    if (nodes !== undefined) roots[root] = sanitizeNodes(nodes);
  }
  return roots;
}

/** Fremde Daten in saubere ImportNodes umwandeln (unbekannte Felder fallen weg). */
export function sanitizeNodes(value: unknown, depth = 0): ImportNode[] {
  if (!Array.isArray(value) || depth > 100) return [];
  const result: ImportNode[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const title = typeof item.title === 'string' ? item.title : '';
    if (typeof item.url === 'string') result.push({ title, url: item.url });
    else result.push({ title, children: sanitizeNodes(item.children, depth + 1) });
  }
  return result;
}

export function countImportNodes(roots: ImportRoots): { bookmarks: number; folders: number } {
  let bookmarks = 0;
  let folders = 0;
  const walk = (nodes: ImportNode[]) => {
    for (const n of nodes) {
      if (n.url !== undefined) bookmarks++;
      else {
        folders++;
        walk(n.children ?? []);
      }
    }
  };
  for (const nodes of Object.values(roots)) walk(nodes ?? []);
  return { bookmarks, folders };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
