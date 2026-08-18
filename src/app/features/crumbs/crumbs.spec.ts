import { TreeItem, TreeNode, itemPath } from '../../models/node.model';
import { Pfadglied, gliedere } from './crumbs';

function knoten(path: string): TreeItem {
  return { kind: 'el', node: { path, name: path.split('.').pop() ?? path } as TreeNode };
}

/** Pfad eines Glieds bzw. 'aus' fuer die Auslassung — kurze Erwartungen. */
function marke(g: Pfadglied | undefined): string {
  if (!g) return '';
  return g.it ? itemPath(g.it) : 'aus';
}

/** Kette Wurzel → Ziel, wie sie die Pfadleiste vom NavService bekommt. */
const kette: TreeItem[] = ['a', 'a.b', 'a.b.c', 'a.b.c.d', 'a.b.c.d.e'].map(knoten);

describe('gliedere (Pfadleiste)', () => {
  it('zeigt ohne Enge die ganze Kette', () => {
    const g = gliedere(kette, 0);
    expect(g.map(marke)).toEqual(['a', 'a.b', 'a.b.c', 'a.b.c.d', 'a.b.c.d.e']);
  });

  it('faltet von der Wurzel her ein und laesst Wurzel und Ziel stehen', () => {
    const g = gliedere(kette, 2);
    expect(g.map(marke)).toEqual(['a', 'aus', 'a.b.c.d', 'a.b.c.d.e']);
    expect((g[1]?.aus ?? []).map(itemPath)).toEqual(['a.b', 'a.b.c']);
  });

  it('faltet nie das ausgewaehlte Element ein', () => {
    const g = gliedere(kette, 99);
    expect(g.map(marke)).toEqual(['a', 'aus', 'a.b.c.d.e']);
  });

  it('nimmt bei ganz kleinem Platz auch die Wurzel in die Auslassung', () => {
    const g = gliedere(kette, 99, true);
    expect(g.map(marke)).toEqual(['aus', 'a.b.c.d.e']);
    expect((g[0]?.aus ?? []).length).toBe(4);
  });

  it('laesst eine einzelne Station unangetastet', () => {
    expect(gliedere([knoten('a')], 3, true).map(marke)).toEqual(['a']);
  });

  it('vertraegt die leere Kette', () => {
    expect(gliedere([], 2, true)).toEqual([]);
  });
});
