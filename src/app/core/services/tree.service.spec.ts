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
});
