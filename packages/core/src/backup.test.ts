import { describe, expect, it } from 'vitest';
import { countImportNodes, createBackup, importIntoTree, parseLinkSyncBackup, sanitizeNodes } from './backup';
import { Clock } from './clock';
import { BookmarkTree } from './tree';

const titles = (tree: BookmarkTree, root: string) => tree.children(root).map((n) => n.title);

describe('Sicherung', () => {
  it('lässt sich erstellen und wieder einspielen', () => {
    const tree = new BookmarkTree(new Clock('a'));
    const folder = tree.addFolder('toolbar', 'News');
    tree.addBookmark(folder, 'NZZ', 'https://nzz.ch');
    tree.addBookmark('menu', 'Menü', 'https://menu');
    const backup = createBackup(tree, new Date('2026-10-25T12:00:00Z'));
    expect(backup.createdAt).toBe('2026-10-25T12:00:00.000Z');

    const restored = new BookmarkTree(new Clock('b'));
    const roots = parseLinkSyncBackup(JSON.parse(JSON.stringify(backup)))!;
    expect(importIntoTree(restored, roots, { replace: true })).toEqual({ bookmarks: 2, folders: 1, skipped: 0 });
    expect(restored.toTree()).toEqual(
      tree.toTree().map((r) => ({ ...r, children: expect.anything() })),
    );
    expect(JSON.stringify(createBackup(restored).roots)).toBe(JSON.stringify(backup.roots));
  });

  it('ersetzt beim Wiederherstellen alles Bisherige', () => {
    const tree = new BookmarkTree(new Clock('a'));
    tree.addBookmark('toolbar', 'Alt', 'https://alt');
    importIntoTree(tree, { toolbar: [{ title: 'Neu', url: 'https://neu' }] }, { replace: true });
    expect(titles(tree, 'toolbar')).toEqual(['Neu']);
  });

  it('überspringt beim Zusammenführen vorhandene Adressen', () => {
    const tree = new BookmarkTree(new Clock('a'));
    tree.addBookmark('toolbar', 'Schon da', 'https://da');
    const result = importIntoTree(
      tree,
      { toolbar: [{ title: 'Doppelt', url: 'https://da' }], other: [{ title: 'Neu', url: 'https://neu' }] },
      { replace: false },
    );
    expect(result).toEqual({ bookmarks: 1, folders: 0, skipped: 1 });
    expect(titles(tree, 'toolbar')).toEqual(['Schon da']);
    expect(titles(tree, 'other')).toEqual(['Neu']);
  });

  it('erkennt fremde Dateien nicht als LinkSync-Sicherung', () => {
    expect(parseLinkSyncBackup({ format: 'etwas anderes' })).toBeNull();
    expect(parseLinkSyncBackup('text')).toBeNull();
  });

  it('bereinigt fehlerhafte Daten', () => {
    expect(sanitizeNodes([null, 5, { title: 'A', url: 'https://a', extra: 1 }, { children: [{ title: 'B', url: 'https://b' }] }])).toEqual([
      { title: 'A', url: 'https://a' },
      { title: '', children: [{ title: 'B', url: 'https://b' }] },
    ]);
  });

  it('zählt Lesezeichen und Ordner', () => {
    expect(countImportNodes({ toolbar: [{ title: 'F', children: [{ title: 'A', url: 'x:a' }] }], other: [{ title: 'B', url: 'x:b' }] })).toEqual({
      bookmarks: 2,
      folders: 1,
    });
  });
});
