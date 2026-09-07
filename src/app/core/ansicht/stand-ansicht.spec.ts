import { TestBed } from '@angular/core/testing';
import { StandAnsicht } from './stand-ansicht';
import { StateService } from '../services/state.service';
import { TreeService } from '../services/tree.service';
import { XsdParserService } from '../services/xsd-parser.service';
import { TreeNode as TNode } from '../../models/node.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="kopf" type="Type.Test.Kopf"/>
      <xs:element name="akte" type="Type.Test.Akte" minOccurs="0" maxOccurs="unbounded"/>
      <xs:element name="frei" type="xs:string" minOccurs="0"/>
      <xs:element name="pflichtfeld" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Kopf">
    <xs:sequence><xs:element name="sachgebiet" type="xs:string" minOccurs="0"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Akte">
    <xs:sequence>
      <xs:element name="identifikation" type="xs:string"/>
      <xs:element name="zusatz" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;

/**
 * Die Arbeits-Zeile zeigt den Stand je Ast — die Ableitung dahinter ist
 * DOM-frei und wird hier am Interface geprueft: Zustand hinein, Zaehler
 * heraus. Der interessante Teil ist die Pfad-Grammatik: ein Punkt in einem
 * Vorkommen (`…/akte@a1/zusatz`) gehoert zum Ast `…/akte`, obwohl sein Pfad
 * nicht mit `…/akte/` beginnt.
 */
describe('StandAnsicht', () => {
  let ansicht: StandAnsicht;
  let state: StateService;
  let tree: TreeService;
  let root: TNode;

  const M = 'nachricht.test.0001';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    ansicht = TestBed.inject(StandAnsicht);
    state = TestBed.inject(StateService);
    tree = TestBed.inject(TreeService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const idx = TestBed.inject(XsdParserService).buildIndexFrom([
      { file: 'xjustiz_0000_test.xsd', dom },
    ]).idx;
    state.idx.set(idx);
    state.msgName.set(M);
    root = tree.buildRoot(M, idx);
    state.root.set(root);
  });

  /** Der Ast zu einem Kindnamen der Nachricht. */
  const ast = (name: string) => ansicht.aeste().find((a) => a.path === `${M}/${name}`)!;

  it('gruppiert die Entscheidungspunkte nach Ast', () => {
    expect(ansicht.aeste().map((a) => a.path)).toEqual([
      `${M}/kopf`,
      `${M}/akte`,
      `${M}/frei`,
      `${M}/pflichtfeld`,
    ]);

    // kopf: nur das optionale sachgebiet; akte: der Ast selbst und sein
    // optionales zusatz; frei: es selbst; pflichtfeld: gar kein Punkt.
    expect(ast('kopf').gesamt).toBe(1);
    expect(ast('akte').gesamt).toBe(2);
    expect(ast('frei').gesamt).toBe(1);
    expect(ast('pflichtfeld').gesamt).toBe(0);
  });

  it('zaehlt Punkte in Vorkommen zum tragenden Ast', () => {
    const vorher = ast('akte').gesamt;
    state.addAusp(`${M}/akte`, 'Hauptakte');

    // Das Vorkommen selbst und sein optionales Kind kommen hinzu — beide unter
    // `…/akte@…`, also jenseits der '/'-Grenze.
    expect(ast('akte').gesamt).toBeGreaterThan(vorher);
    expect(ansicht.aeste().map((a) => a.path)).toContain(`${M}/akte`);
  });

  it('meldet einen Ast als vollstaendig, sobald alle seine Punkte beantwortet sind', () => {
    expect(ast('frei').vollstaendig).toBe(false);
    expect(ast('frei').entschieden).toBe(0);
    expect(ast('frei').offen).toBe(1);

    state.elemente.set({ [`${M}/frei`]: { status: 's1' } });

    expect(ast('frei').entschieden).toBe(1);
    expect(ast('frei').offen).toBe(0);
    expect(ast('frei').vollstaendig).toBe(true);
  });

  it('nennt einen Ast ohne Entscheidungspunkte nicht vollstaendig', () => {
    // Sonst traege ein Ast, an dem nie etwas zu entscheiden war, das gruene
    // Zeichen der geleisteten Arbeit.
    expect(ast('pflichtfeld').gesamt).toBe(0);
    expect(ast('pflichtfeld').vollstaendig).toBe(false);
  });

  it('markiert den Ast, auf oder unter dem die Auswahl liegt', () => {
    expect(ansicht.aeste().every((a) => !a.aktiv)).toBe(true);

    const zusatz = tree
      .kinder(tree.kinder(root).find((k) => k.path === `${M}/akte`)!)
      .find((k) => k.path === `${M}/akte/zusatz`)!;
    state.selItem.set({ kind: 'el', node: zusatz });

    expect(ast('akte').aktiv).toBe(true);
    expect(ast('frei').aktiv).toBe(false);
  });

  it('zaehlt offene, beantwortete und mit Notiz versehene Felder', () => {
    state.elemente.set({
      [`${M}/frei`]: { status: 's1' },
      [`${M}/akte`]: { anmerkung: 'Rückfrage an die Fachseite' },
      [`${M}/kopf/sachgebiet`]: { anmerkung: '   ' },
    });

    const z = ansicht.hervorhebungZaehler();
    expect(z.beantwortet).toBe(1);
    // Leerraum ist keine Notiz.
    expect(z.notiz).toBe(1);
    expect(z.offen).toBe(ansicht.gesamt().y - ansicht.gesamt().x - ansicht.gesamt().zuKlaeren);
  });
});
