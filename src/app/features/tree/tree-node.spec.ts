import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TreeNode } from './tree-node';
import { StateService } from '../../core/services/state.service';
import { TreeService } from '../../core/services/tree.service';
import { XsdParserService } from './../../core/services/xsd-parser.service';
import { TreeNode as TNode } from '../../models/node.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence><xs:element name="datum" type="xs:date"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Akte">
    <xs:sequence><xs:element name="identifikation" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;

/**
 * Der Kasten einer Schema-Erweiterung (#97): der Typ steht am Knoten, ein im
 * aktiven Schema fehlender Typ wird rot gemeldet, und die Loeschfrage nennt die
 * Zahl der mitfallenden Festlegungen.
 */
describe('TreeNode — Kasten einer Schema-Erweiterung', () => {
  let state: StateService;
  let tree: TreeService;
  let root: TNode;
  let fixture: ComponentFixture<TreeNode>;

  const M = 'nachricht.test.0001';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TreeNode] }).compileComponents();
    state = TestBed.inject(StateService);
    tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx;
    state.idx.set(idx);
    root = tree.buildRoot(M, idx);
    state.root.set(root);
    fixture = TestBed.createComponent(TreeNode);
  });

  /** Den Kasten fuer den Erweiterungs-Knoten unter `elternPfad` rendern. */
  const rendere = (elternPfad: string, id: string): HTMLElement => {
    const eltern = elternPfad === M ? root : findeKnoten(elternPfad);
    const node = tree.kinder(eltern).find((k) => k.path === elternPfad + '/~' + id)!;
    fixture.componentRef.setInput('item', { kind: 'el', node });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  /** Knoten im gerenderten Baum suchen (nur die Tiefe, die die Tests brauchen). */
  const findeKnoten = (pfad: string): TNode => {
    const suche = (n: TNode, tiefe: number): TNode | null => {
      if (n.path === pfad) return n;
      if (tiefe > 4) return null;
      for (const c of tree.kinder(n)) {
        const hit = suche(c, tiefe + 1);
        if (hit) return hit;
      }
      return null;
    };
    return suche(root, 0)!;
  };

  const tags = (el: HTMLElement): string[] =>
    Array.from(el.querySelectorAll('.tags .tag')).map((t) => (t.textContent ?? '').trim());

  it('zeigt neben der Kennzeichnung ein Pill mit dem Datentyp', () => {
    const id = state.addErweiterung(M, {
      name: 'beiakte',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Akte',
      datentypQuelle: 'schema',
    });

    const el = rendere(M, id);

    expect(el.querySelector('.box')?.classList).toContain('extBox');
    expect(tags(el)).toContain('Schema-Erweiterung');
    expect(tags(el)).toContain('Type.Test.Akte');
  });

  it('meldet einen im aktiven Schema fehlenden Typ rot', () => {
    const id = state.addErweiterung(M, {
      name: 'geheimhaltung',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Entfallen',
      datentypQuelle: 'schema',
    });

    const el = rendere(M, id);

    const warn = el.querySelector('.tag.t-typerr');
    expect(warn).not.toBeNull();
    expect(warn!.getAttribute('title')).toContain('Type.Test.Entfallen');
    expect(warn!.getAttribute('title')).toContain('3.6.2');
  });

  it('ein Freitext-Typ bleibt ohne rote Meldung', () => {
    const id = state.addErweiterung(M, {
      name: 'wunschfeld',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Entfallen',
      datentypQuelle: 'frei',
    });

    expect(rendere(M, id).querySelector('.tag.t-typerr')).toBeNull();
  });

  it('nennt beim Loeschen die Zahl der Festlegungen darunter', () => {
    const id = state.addErweiterung(M, {
      name: 'beiakte',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Akte',
      datentypQuelle: 'schema',
    });
    state.setElementProfile(`${M}/~${id}/identifikation`, { status: 's1' });
    const frage = spyOn(window, 'confirm').and.returnValue(false);

    rendere(M, id).querySelector<HTMLButtonElement>('.delBtn')!.click();

    expect(frage.calls.mostRecent().args[0]).toContain('1 Festlegung');
    expect(state.erweiterungenOf(M)!.length).toBe(1);
  });

  it('das Loeschen einer inneren Erweiterung laesst die aeussere stehen', () => {
    const aussen = state.addErweiterung(M, {
      name: 'beiakte',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Akte',
      datentypQuelle: 'schema',
    });
    const innenEltern = `${M}/~${aussen}/identifikation`;
    const innen = state.addErweiterung(innenEltern, {
      name: 'praefix',
      min: '0',
      max: '1',
      datentyp: 'string',
    });
    spyOn(window, 'confirm').and.returnValue(true);

    rendere(innenEltern, innen).querySelector<HTMLButtonElement>('.delBtn')!.click();

    expect(state.erweiterungenOf(innenEltern)).toBeNull();
    expect(state.erweiterungenOf(M)!.map((e) => e.id)).toEqual([aussen]);
  });
});
