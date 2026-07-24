import { TestBed } from '@angular/core/testing';
import { TreeService } from './tree.service';
import { XsdParserService } from './xsd-parser.service';
import { StateService } from './state.service';
import { XsdDoc, XsdIndex } from '../../models/xsd-index.model';
import { TreeItem } from '../../models/node.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="beteiligung" type="Type.Test.Bet" minOccurs="0" maxOccurs="unbounded"/>
      <xs:element name="datum" type="xs:date"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Bet">
    <xs:sequence><xs:element name="name" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;

/** Schema fuer die Pflicht-Rueckgrat-Erkennung: Pflichtkette, optionaler Ast, choice. */
const XSD_MAND = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="beteiligter" type="Type.Test.Bet"/>
      <xs:element name="optionalBlock" type="Type.Test.Opt" minOccurs="0"/>
      <xs:choice>
        <xs:element name="varianteA" type="xs:string"/>
        <xs:element name="varianteB" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Bet">
    <xs:sequence>
      <xs:element name="name" type="xs:string"/>
      <xs:element name="optionalFeld" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Opt">
    <xs:sequence><xs:element name="pflichtImOptional" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;

describe('TreeService', () => {
  let tree: TreeService;
  let state: StateService;
  let idx: XsdIndex;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    tree = TestBed.inject(TreeService);
    state = TestBed.inject(StateService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    idx = parser.buildIndexFrom(docs).idx;
  });

  it('buildRoot + childItems expandiert die Sequenz', () => {
    const root = tree.buildRoot('nachricht.test.0001', idx);
    expect(root.typeName).toBe('Type.Test.Root');
    const kids = tree.childItems({ kind: 'el', node: root });
    expect(kids.map((k) => (k.kind === 'el' ? k.node.name : ''))).toEqual(['beteiligung', 'datum']);
  });

  it('isLeaf/isRepeatable arbeiten korrekt', () => {
    const root = tree.buildRoot('nachricht.test.0001', idx);
    const kids = tree.childItems({ kind: 'el', node: root });
    const bet = (kids[0] as Extract<TreeItem, { kind: 'el' }>).node;
    const datum = (kids[1] as Extract<TreeItem, { kind: 'el' }>).node;
    expect(tree.isRepeatable(bet)).toBeTrue();
    expect(tree.isLeaf(datum)).toBeTrue();
    expect(tree.isLeaf(bet)).toBeFalse();
  });

  it('Ausprägungen ersetzen die Element-Kinder', () => {
    const root = tree.buildRoot('nachricht.test.0001', idx);
    const kids = tree.childItems({ kind: 'el', node: root });
    const bet = (kids[0] as Extract<TreeItem, { kind: 'el' }>).node;
    state.addAusp(bet.path, 'Notar');
    const items = tree.childItems({ kind: 'el', node: bet });
    expect(items.length).toBe(1);
    expect(items[0]!.kind).toBe('ausp');
    // Innerhalb der Auspraegung wird der Kontextknoten expandiert.
    const inner = tree.childItems(items[0]!);
    expect(inner.map((k) => (k.kind === 'el' ? k.node.name : ''))).toEqual(['name']);
  });

  it('collectMandatoryPaths markiert nur das Pflicht-Rueckgrat', () => {
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD_MAND, 'application/xml');
    const mandIdx = parser.buildIndexFrom([{ file: 'xjustiz_0000_mand.xsd', dom }]).idx;
    const root = tree.buildRoot('nachricht.test.0001', mandIdx);

    const paths = tree.collectMandatoryPaths(root);

    // Pflichtkette wird markiert ...
    expect(paths).toContain('nachricht.test.0001/beteiligter');
    expect(paths).toContain('nachricht.test.0001/beteiligter/name');
    // ... optionale Elemente/Aeste nicht ...
    expect(paths).not.toContain('nachricht.test.0001/beteiligter/optionalFeld');
    expect(paths).not.toContain('nachricht.test.0001/optionalBlock');
    // ... darunterliegende min=1 unter optionalem Elternknoten werden abgeschnitten ...
    expect(paths.some((p) => p.includes('pflichtImOptional'))).toBeFalse();
    // ... und choice-Alternativen bleiben frei.
    expect(paths.some((p) => p.includes('variante'))).toBeFalse();
    // Der Wurzelknoten selbst ist nicht enthalten.
    expect(paths).not.toContain('nachricht.test.0001');
  });

  describe('Schema-Erweiterungen', () => {
    it('kinder haengt Erweiterungs-Knoten hinter die Schema-Kinder', () => {
      const root = tree.buildRoot('nachricht.test.0001', idx);
      const id = state.addErweiterung(root.path, {
        name: 'zusatzAngabe',
        beschreibung: 'fehlt im Schema',
        min: '0',
        max: '1',
        datentyp: 'string',
      });
      const kids = tree.kinder(root);
      expect(kids.map((k) => k.name)).toEqual(['beteiligung', 'datum', 'zusatzAngabe']);
      const erw = kids[2]!;
      // Synthese-Mapping aus der Erweiterung.
      expect(erw.path).toBe(root.path + '/~' + id);
      expect(erw.doc).toBe('fehlt im Schema');
      expect(erw.typeName).toBe('string');
      expect(erw.min).toBe('0');
      expect(erw.depth).toBe(root.depth + 1);
      expect(erw.erweiterung?.id).toBe(id);
    });

    it('childItems liefert Erweiterungen auch unter Auspraegungs-Kontexten', () => {
      const root = tree.buildRoot('nachricht.test.0001', idx);
      const bet = tree.kinder(root)[0]!;
      const aid = state.addAusp(bet.path, 'Notar');
      state.addErweiterung(bet.path + '@' + aid, {
        name: 'rolleNeu',
        min: '1',
        max: '1',
        datentyp: 'token',
      });
      const items = tree.childItems({ kind: 'el', node: bet });
      const inner = tree.childItems(items[0]!);
      expect(inner.map((k) => (k.kind === 'el' ? k.node.name : ''))).toEqual(['name', 'rolleNeu']);
    });

    it('isLeaf/itemHasKids: Container-Erweiterung aufklappbar, Wert-Erweiterung Blatt', () => {
      const root = tree.buildRoot('nachricht.test.0001', idx);
      const cid = state.addErweiterung(root.path, { name: 'block', min: '1', max: '1' });
      const wid = state.addErweiterung(root.path, {
        name: 'feld',
        min: '1',
        max: '1',
        datentyp: 'date',
      });
      const [container, wert] = tree.kinder(root).slice(-2);
      expect(tree.isLeaf(container!)).toBeFalse();
      expect(tree.itemHasKids({ kind: 'el', node: container! })).toBeTrue();
      expect(tree.isLeaf(wert!)).toBeTrue();
      expect(tree.itemHasKids({ kind: 'el', node: wert! })).toBeFalse();
      // Verschachtelt: Kind unter dem Container erscheint.
      state.addErweiterung(root.path + '/~' + cid, {
        name: 'kind',
        min: '1',
        max: '1',
        datentyp: 'string',
      });
      expect(tree.kinder(container!).map((k) => k.name)).toEqual(['kind']);
      expect(root.path + '/~' + wid).toContain('/~'); // Pfadschema
    });

    it('kinder liefert nach add/remove frische Knoten (kein Cache-Staleness)', () => {
      const root = tree.buildRoot('nachricht.test.0001', idx);
      expect(tree.kinder(root).length).toBe(2);
      const id = state.addErweiterung(root.path, {
        name: 'neu',
        min: '1',
        max: '1',
        datentyp: 'string',
      });
      expect(tree.kinder(root).length).toBe(3);
      state.removeErweiterung(root.path, id);
      expect(tree.kinder(root).length).toBe(2);
    });

    it('itemHasKids erkennt Erweiterungen an Schema-Blaettern nicht faelschlich', () => {
      const root = tree.buildRoot('nachricht.test.0001', idx);
      const datum = tree.kinder(root)[1]!;
      expect(tree.itemHasKids({ kind: 'el', node: datum })).toBeFalse();
    });
  });
});
