/**
 * Nachbildung der Lesezeichen-Schnittstelle von Chrome bzw. Firefox – nur für Tests.
 */

import type { BookmarksApi, BrowserNode } from './bookmarks-api';

interface Node {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  type?: 'bookmark' | 'folder' | 'separator';
  folderType?: string;
  children?: string[];
}

export type Flavor = 'chrome' | 'firefox';

export class FakeBookmarks implements BookmarksApi {
  private readonly nodes = new Map<string, Node>();
  private nextId = 100;
  /** Protokoll aller Änderungen, um in Tests zu prüfen, was passiert ist. */
  readonly log: string[] = [];

  constructor(readonly flavor: Flavor = 'chrome') {
    if (flavor === 'chrome') {
      this.addRoot('0', '', undefined);
      this.addRoot('1', 'Lesezeichenleiste', 'bookmarks-bar');
      this.addRoot('2', 'Weitere Lesezeichen', 'other');
      this.addRoot('3', 'Mobile Lesezeichen', 'mobile');
    } else {
      this.addRoot('root________', '', undefined);
      this.addRoot('menu________', 'Lesezeichen-Menü', undefined);
      this.addRoot('toolbar_____', 'Lesezeichen-Symbolleiste', undefined);
      this.addRoot('unfiled_____', 'Weitere Lesezeichen', undefined);
      this.addRoot('mobile______', 'Mobile Lesezeichen', undefined);
    }
  }

  get rootIds() {
    return this.flavor === 'chrome'
      ? { toolbar: '1', other: '2', mobile: '3', menu: undefined }
      : { toolbar: 'toolbar_____', other: 'unfiled_____', mobile: 'mobile______', menu: 'menu________' };
  }

  private addRoot(id: string, title: string, folderType: string | undefined) {
    const top = this.flavor === 'chrome' ? '0' : 'root________';
    const node: Node = { id, title, children: [], ...(folderType ? { folderType } : {}) };
    if (this.flavor === 'firefox') node.type = 'folder';
    if (id !== top) {
      node.parentId = top;
      this.nodes.get(top)!.children!.push(id);
    }
    this.nodes.set(id, node);
  }

  // ---------- Schnittstelle ----------

  async getTree(): Promise<BrowserNode[]> {
    return [this.toBrowserNode(this.flavor === 'chrome' ? '0' : 'root________', true)];
  }

  async getChildren(id: string): Promise<BrowserNode[]> {
    return this.require(id).children!.map((c) => this.toBrowserNode(c, false));
  }

  async create(details: { parentId: string; index?: number; title?: string; url?: string }): Promise<BrowserNode> {
    const parent = this.require(details.parentId);
    if (!parent.children) throw new Error('Kein Ordner');
    if (details.url !== undefined && !/^[a-z][a-z0-9+.-]*:/i.test(details.url)) throw new Error('Ungültige URL');
    const id = String(this.nextId++);
    const node: Node = { id, parentId: parent.id, title: details.title ?? '' };
    if (details.url !== undefined) node.url = details.url;
    else node.children = [];
    if (this.flavor === 'firefox') node.type = details.url !== undefined ? 'bookmark' : 'folder';
    this.nodes.set(id, node);
    const index = Math.min(details.index ?? parent.children.length, parent.children.length);
    parent.children.splice(index, 0, id);
    this.log.push(`create ${node.title}`);
    return this.toBrowserNode(id, false);
  }

  async update(id: string, changes: { title?: string; url?: string }): Promise<BrowserNode> {
    const node = this.require(id);
    if (changes.title !== undefined) node.title = changes.title;
    if (changes.url !== undefined) node.url = changes.url;
    this.log.push(`update ${node.title}`);
    return this.toBrowserNode(id, false);
  }

  async move(id: string, destination: { parentId?: string; index?: number }): Promise<BrowserNode> {
    const node = this.require(id);
    const oldParent = this.require(node.parentId!);
    const newParent = this.require(destination.parentId ?? oldParent.id);
    const oldIndex = oldParent.children!.indexOf(id);
    oldParent.children!.splice(oldIndex, 1);
    let index = destination.index ?? newParent.children!.length;
    // Wie Chrome: Beim Verschieben nach unten im selben Ordner zählt der Index vor dem Entfernen.
    if (this.flavor === 'chrome' && oldParent === newParent && index > oldIndex) index--;
    newParent.children!.splice(Math.min(index, newParent.children!.length), 0, id);
    node.parentId = newParent.id;
    this.log.push(`move ${node.title}`);
    return this.toBrowserNode(id, false);
  }

  async remove(id: string): Promise<void> {
    const node = this.require(id);
    if (node.children?.length) throw new Error('Ordner nicht leer');
    this.detach(node);
  }

  async removeTree(id: string): Promise<void> {
    this.detach(this.require(id));
  }

  // ---------- Hilfen für Tests ----------

  /** Separator (Trennlinie) anlegen – gibt es nur in Firefox. */
  addSeparator(parentId: string): string {
    const parent = this.require(parentId);
    const id = String(this.nextId++);
    this.nodes.set(id, { id, parentId, title: '', type: 'separator', url: 'data:' });
    parent.children!.push(id);
    return id;
  }

  /** Lesbare Darstellung eines Ordners, z. B. ["A", "Ordner/", ["B"]]. */
  outline(folderId: string): unknown[] {
    return this.require(folderId).children!.flatMap((c) => {
      const n = this.nodes.get(c)!;
      if (n.type === 'separator') return ['---'];
      if (n.children) return [`${n.title}/`, this.outline(c)];
      return [n.title];
    });
  }

  findByTitle(title: string): string {
    for (const n of this.nodes.values()) if (n.title === title) return n.id;
    throw new Error(`Nicht gefunden: ${title}`);
  }

  private detach(node: Node) {
    const parent = this.require(node.parentId!);
    parent.children!.splice(parent.children!.indexOf(node.id), 1);
    const stack = [node.id];
    while (stack.length) {
      const n = this.nodes.get(stack.pop()!)!;
      stack.push(...(n.children ?? []));
      this.nodes.delete(n.id);
    }
    this.log.push(`remove ${node.title}`);
  }

  private require(id: string): Node {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Lesezeichen ${id} gibt es nicht`);
    return node;
  }

  private toBrowserNode(id: string, deep: boolean): BrowserNode {
    const n = this.require(id);
    const parent = n.parentId ? this.nodes.get(n.parentId) : undefined;
    const result: BrowserNode = { id: n.id, title: n.title };
    if (n.parentId) result.parentId = n.parentId;
    if (parent) result.index = parent.children!.indexOf(id);
    if (n.url !== undefined) result.url = n.url;
    if (n.type) result.type = n.type;
    if (n.folderType) result.folderType = n.folderType;
    if (n.children && deep) result.children = n.children.map((c) => this.toBrowserNode(c, true));
    return result;
  }
}
