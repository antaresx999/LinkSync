/**
 * Abgleich zwischen den Lesezeichen des Browsers und dem LinkSync-Baum.
 *
 * Ein Sync-Durchgang läuft so:
 *   1. captureLocalChanges: Browser → LinkSync. Alles, was im Browser anders
 *      ist als im LinkSync-Baum, ist eine lokale Änderung und wird übernommen.
 *   2. Sync mit dem Server (siehe @linksync/core).
 *   3. applyToBrowser: LinkSync → Browser. Der Browser wird an den Baum
 *      angepasst, der jetzt auch die Änderungen der anderen Geräte enthält.
 *
 * Weil Schritt 1 den ganzen Browser vergleicht, gehen auch Änderungen nicht
 * verloren, die gemacht wurden, während die Erweiterung nicht lief.
 */

import { isRootId, type BookmarkTree, type RootId } from '@linksync/core';
import { detectRoots, isFolder, isSyncable, type BookmarksApi, type BrowserNode } from './bookmarks-api';
import type { IdMap } from './id-map';

/** Schritt 1: Änderungen im Browser in den LinkSync-Baum übernehmen. Gibt die Anzahl Änderungen zurück. */
export async function captureLocalChanges(api: BookmarksApi, tree: BookmarkTree, map: IdMap): Promise<number> {
  const browserTree = await api.getTree();
  const roots = detectRoots(browserTree);
  const browserNodes = indexNodes(browserTree);
  const seen = new Set<string>();
  let changes = 0;

  const walk = (folder: BrowserNode, parentId: string) => {
    let previous: string | undefined; // LinkSync-ID des vorherigen Geschwisters im Browser
    for (const child of (folder.children ?? []).filter(isSyncable)) {
      let id = map.linkSyncId(child.id);
      const folderNode = isFolder(child);
      const record = id ? tree.get(id) : undefined;

      if (!id || !record || !tree.exists(id) || (record.fields.kind === 'folder') !== folderNode) {
        // Neu im Browser.
        const index = insertIndex(tree, parentId, previous);
        id = folderNode
          ? tree.addFolder(parentId, child.title, index)
          : tree.addBookmark(parentId, child.title, child.url ?? '', index);
        map.set(id, child.id);
        changes++;
      } else {
        // Bekannt: verschoben, umbenannt oder URL geändert?
        if (!isDirectlyAfter(tree, map, parentId, previous, id)) {
          tree.move(id, parentId, insertIndex(tree, parentId, previous, id));
          changes++;
        }
        const titleChanged = record.fields.title !== child.title;
        const urlChanged = !folderNode && record.fields.url !== (child.url ?? '');
        if (titleChanged || urlChanged) {
          tree.update(id, folderNode ? { title: child.title } : { title: child.title, url: child.url ?? '' });
          changes++;
        }
      }
      seen.add(id);
      previous = id;
      if (folderNode) walk(child, id);
    }
  };

  for (const [rootId, browserId] of roots) {
    const node = browserNodes.get(browserId);
    if (node) walk(node, rootId);
  }

  // Bekannte Einträge, die nicht mehr im Browser sind, wurden lokal gelöscht.
  for (const [id] of map.entries()) {
    if (seen.has(id)) continue;
    if (tree.exists(id)) {
      tree.remove(id);
      changes++;
    }
    map.deleteLinkSync(id);
  }
  return changes;
}

/**
 * Steht der Eintrag im LinkSync-Baum direkt nach "previous"? Gezählt werden nur
 * Einträge, die auch im Browser sind – Einträge, die dieser Browser nicht
 * anzeigen kann, werden übersprungen.
 */
function isDirectlyAfter(tree: BookmarkTree, map: IdMap, parentId: string, previous: string | undefined, id: string) {
  if (tree.parentOf(id) !== parentId) return false;
  const visible = tree.childIds(parentId).filter((c) => map.browserId(c) !== undefined);
  const expected = previous === undefined ? 0 : visible.indexOf(previous) + 1;
  return visible[expected] === id;
}

/** Einfügestelle direkt nach "previous" (bzw. ganz oben), ohne den Eintrag selbst mitzuzählen. */
function insertIndex(tree: BookmarkTree, parentId: string, previous: string | undefined, self?: string): number {
  if (previous === undefined) return 0;
  const others = tree.childIds(parentId).filter((c) => c !== self);
  return others.indexOf(previous) + 1;
}

export interface ApplyOptions {
  /** true = Lesezeichen im Browser, die LinkSync nicht kennt, werden gelöscht (beim Verbinden mit bestehendem Konto). */
  removeUnknown?: boolean;
}

export interface ApplyResult {
  created: number;
  updated: number;
  moved: number;
  removed: number;
  /** Einträge, die der Browser nicht anlegen konnte (z. B. ungültige URL). */
  errors: string[];
}

/** Schritt 3: Den Browser an den LinkSync-Baum anpassen. */
export async function applyToBrowser(
  api: BookmarksApi,
  tree: BookmarkTree,
  map: IdMap,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, moved: 0, removed: 0, errors: [] };
  const browserTree = await api.getTree();
  const roots = detectRoots(browserTree);
  const nodes = indexNodes(browserTree);
  const leftovers: string[] = [];

  /** In welchem Hauptordner liegt ein Eintrag? */
  const rootOf = (id: string): RootId | undefined => {
    let current: string | undefined = id;
    while (current !== undefined && !isRootId(current)) current = tree.parentOf(current);
    return current;
  };

  const syncFolder = async (parentId: string, browserParentId: string) => {
    const desired = tree.childIds(parentId).map((id) => toItem(tree, id));
    const order = (await api.getChildren(browserParentId)).map((c) => c.id);
    const placed = new Set<string>();
    let previous: string | undefined;

    for (const item of desired) {
      const target = previous === undefined ? 0 : order.indexOf(previous) + 1;
      let browserId = map.browserId(item.id);
      const existing = browserId ? nodes.get(browserId) : undefined;

      try {
        if (!browserId || !existing || isFolder(existing) !== (item.kind === 'folder')) {
          const created = await api.create({
            parentId: browserParentId,
            index: target,
            title: item.title,
            ...(item.kind === 'bookmark' ? { url: item.url } : {}),
          });
          browserId = created.id;
          map.set(item.id, browserId);
          nodes.set(browserId, created);
          order.splice(target, 0, browserId);
          result.created++;
        } else {
          if (needsUpdate(existing, item)) {
            await api.update(browserId, item.kind === 'bookmark' ? { title: item.title, url: item.url } : { title: item.title });
            existing.title = item.title;
            if (item.kind === 'bookmark') existing.url = item.url;
            result.updated++;
          }
          const current = order.indexOf(browserId);
          if (current !== target) {
            await api.move(browserId, { parentId: browserParentId, index: target });
            if (current >= 0) order.splice(current, 1);
            order.splice(target, 0, browserId);
            existing.parentId = browserParentId;
            result.moved++;
          }
        }
      } catch (err) {
        result.errors.push(`${item.title}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      placed.add(browserId);
      previous = browserId;
      if (item.kind === 'folder') await syncFolder(item.id, browserId);
    }

    for (const id of order) if (!placed.has(id)) leftovers.push(id);
  };

  for (const [rootId, browserId] of roots) await syncFolder(rootId, browserId);

  // Aufräumen erst am Schluss, damit verschobene Einträge vorher ihren neuen Platz haben.
  for (const browserId of leftovers) {
    const node = nodes.get(browserId);
    if (!node || !isSyncable(node)) continue;
    const id = map.linkSyncId(browserId);
    let remove: boolean;
    if (id) {
      // Gelöscht – oder in einem Hauptordner, den dieser Browser nicht hat (z. B. "Lesezeichenmenü" in Chrome).
      remove = !tree.exists(id) || !roots.has(rootOf(id)!);
    } else {
      remove = options.removeUnknown === true;
    }
    if (!remove) continue;
    try {
      await (isFolder(node) ? api.removeTree(browserId) : api.remove(browserId));
      result.removed++;
    } catch {
      // Schon mit dem Elternordner gelöscht.
    }
    if (id) map.deleteLinkSync(id);
  }

  // Zuordnungen entfernen, deren Browser-Lesezeichen es nicht mehr gibt.
  const remaining = indexNodes(await api.getTree());
  for (const [id, browserId] of map.entries()) {
    if (!remaining.has(browserId)) map.deleteLinkSync(id);
  }
  return result;
}

interface Item {
  id: string;
  kind: 'bookmark' | 'folder';
  title: string;
  url: string;
}

function toItem(tree: BookmarkTree, id: string): Item {
  const { kind, title, url } = tree.get(id)!.fields;
  return { id, kind, title, url: url ?? '' };
}

function needsUpdate(node: BrowserNode, item: Item): boolean {
  if (node.title !== item.title) return true;
  return item.kind === 'bookmark' && (node.url ?? '') !== item.url;
}

function indexNodes(tree: BrowserNode[]): Map<string, BrowserNode> {
  const index = new Map<string, BrowserNode>();
  const stack = [...tree];
  while (stack.length) {
    const node = stack.pop()!;
    index.set(node.id, node);
    if (node.children) stack.push(...node.children);
  }
  return index;
}
