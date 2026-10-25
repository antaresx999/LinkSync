import { describe, expect, it } from 'vitest';
import { Clock } from './clock';
import { updateRecord } from './record';
import { BookmarkTree, TreeError, type TreeNode } from './tree';

const newTree = () => new BookmarkTree(new Clock('a'));
/** Uhr eines anderen Geräts, das etwas später ändert. */
const laterDevice = () => new Clock('b', undefined, () => Date.now() + 1000);
const titles = (nodes: TreeNode[]) => nodes.map((n) => n.title);

describe('BookmarkTree – lokale Änderungen', () => {
  it('legt Lesezeichen und Ordner an', () => {
    const tree = newTree();
    const folder = tree.addFolder('toolbar', 'News');
    tree.addBookmark(folder, 'Heise', 'https://heise.de');
    const [toolbar] = tree.toTree();
    expect(toolbar!.children).toMatchObject([
      { kind: 'folder', title: 'News', children: [{ kind: 'bookmark', title: 'Heise', url: 'https://heise.de' }] },
    ]);
  });

  it('fügt an der gewünschten Stelle ein', () => {
    const tree = newTree();
    tree.addBookmark('toolbar', 'B', 'https://b');
    tree.addBookmark('toolbar', 'D', 'https://d');
    tree.addBookmark('toolbar', 'A', 'https://a', 0);
    tree.addBookmark('toolbar', 'C', 'https://c', 2);
    expect(titles(tree.children('toolbar'))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('verschiebt innerhalb und zwischen Ordnern', () => {
    const tree = newTree();
    const a = tree.addBookmark('toolbar', 'A', 'https://a');
    tree.addBookmark('toolbar', 'B', 'https://b');
    tree.move(a, 'toolbar', 2);
    expect(titles(tree.children('toolbar'))).toEqual(['B', 'A']);
    tree.move(a, 'menu');
    expect(titles(tree.children('menu'))).toEqual(['A']);
  });

  it('löscht Ordner samt Inhalt', () => {
    const tree = newTree();
    const folder = tree.addFolder('toolbar', 'Ordner');
    const sub = tree.addFolder(folder, 'Unterordner');
    const bm = tree.addBookmark(sub, 'X', 'https://x');
    tree.remove(folder);
    expect(tree.children('toolbar')).toEqual([]);
    expect(tree.get(bm)!.fields.deleted).toBe(true);
  });

  it('ändert Titel und URL', () => {
    const tree = newTree();
    const bm = tree.addBookmark('toolbar', 'Alt', 'https://alt');
    tree.update(bm, { title: 'Neu', url: 'https://neu' });
    expect(tree.children('toolbar')[0]).toMatchObject({ title: 'Neu', url: 'https://neu' });
  });

  it('verhindert unsinnige Änderungen', () => {
    const tree = newTree();
    const outer = tree.addFolder('toolbar', 'Aussen');
    const inner = tree.addFolder(outer, 'Innen');
    const bm = tree.addBookmark('toolbar', 'X', 'https://x');
    expect(() => tree.move(outer, inner)).toThrow(TreeError);
    expect(() => tree.move(outer, outer)).toThrow(TreeError);
    expect(() => tree.addBookmark(bm, 'In Lesezeichen', 'https://y')).toThrow(TreeError);
    expect(() => tree.addBookmark('gibtsnicht', 'Y', 'https://y')).toThrow(TreeError);
    expect(() => tree.update(outer, { url: 'https://z' })).toThrow(TreeError);
  });

  it('merkt sich, was hochgeladen werden muss', () => {
    const tree = newTree();
    const bm = tree.addBookmark('toolbar', 'X', 'https://x');
    expect(tree.dirtyIds()).toEqual([bm]);
    tree.markClean(tree.get(bm)!);
    expect(tree.dirtyIds()).toEqual([]);
  });
});

describe('BookmarkTree – Widersprüche auflösen', () => {
  it('rettet Einträge, deren Ordner gelöscht wurde, nach "Weitere Lesezeichen"', () => {
    const tree = newTree();
    const folder = tree.addFolder('toolbar', 'Ordner');
    const bm = tree.addBookmark(folder, 'Gerettet', 'https://x');
    // Ein anderes Gerät hat nur den Ordner gelöscht (ohne von dem Lesezeichen zu wissen).
    tree.applyRemote(updateRecord(tree.get(folder)!, { deleted: true }, laterDevice().tick()));
    expect(tree.parentOf(bm)).toBe('other');
    expect(titles(tree.children('other'))).toEqual(['Gerettet']);
  });

  it('löst Kreise auf, die durch gleichzeitiges Verschieben entstehen', () => {
    const tree = newTree();
    const x = tree.addFolder('toolbar', 'X');
    const y = tree.addFolder('toolbar', 'Y');
    const remote = laterDevice();
    // Gerät A verschiebt X in Y, Gerät B verschiebt Y in X.
    tree.move(x, y);
    tree.applyRemote(updateRecord(tree.get(y)!, { parentId: x }, remote.tick()));
    const roots = tree.toTree();
    const all = JSON.stringify(roots);
    expect(all).toContain('"X"');
    expect(all).toContain('"Y"');
    // Der Eintrag mit der kleineren ID landet in "Weitere Lesezeichen", der andere darin.
    const [first] = [x, y].sort();
    expect(tree.parentOf(first!)).toBe('other');
  });
});
