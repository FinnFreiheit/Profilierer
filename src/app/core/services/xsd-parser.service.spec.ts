import { TestBed } from '@angular/core/testing';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc, XsdIndex } from '../../models/xsd-index.model';
import { TreeNode } from '../../models/node.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:element name="nachricht.andere.0002" type="Type.Test.Bet"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="beteiligung" type="Type.Test.Bet" minOccurs="0" maxOccurs="unbounded"/>
      <xs:element name="datum" type="xs:date"/>
      <xs:element name="art" type="Code.Test"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Bet">
    <xs:sequence>
      <xs:element name="name" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Sub">
    <xs:complexContent>
      <xs:extension base="Type.Test.Bet">
        <xs:sequence><xs:element name="extra" type="xs:string"/></xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
  <xs:complexType name="Code.Test">
    <xs:annotation><xs:appinfo>
      <codeliste><nameLang>Testliste</nameLang><kennung>urn:test:cl</kennung><beschreibung>desc</beschreibung></codeliste>
    </xs:appinfo></xs:annotation>
    <xs:sequence>
      <xs:element name="code" type="Test.CodeVals"/>
    </xs:sequence>
  </xs:complexType>
  <xs:simpleType name="Test.CodeVals">
    <xs:restriction base="xs:token">
      <xs:enumeration value="A"><xs:annotation><xs:appinfo><wert>Apfel</wert></xs:appinfo></xs:annotation></xs:enumeration>
      <xs:enumeration value="B"><xs:annotation><xs:documentation>Birne</xs:documentation></xs:annotation></xs:enumeration>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>`;

function makeIndex(parser: XsdParserService): { idx: XsdIndex; version: string; kennung: string } {
  const dom = new DOMParser().parseFromString(XSD, 'application/xml');
  const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
  return parser.buildIndexFrom(docs);
}

function node(typeName: string | null, over: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 1, path: 'x', name: 'x', min: '1', max: '1', doc: '', typeName, xsdEl: null, model: null,
    children: null, parent: null, depth: 0, synthetic: false, recursive: false, codelist: null,
    typeStack: [], inChoice: false, ...over,
  };
}

describe('XsdParserService', () => {
  let parser: XsdParserService;
  let idx: XsdIndex;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    parser = TestBed.inject(XsdParserService);
    const r = makeIndex(parser);
    idx = r.idx;
  });

  it('buildIndexFrom erfasst Version, Typen und Nachrichten', () => {
    const r = makeIndex(parser);
    expect(r.version).toBe('3.6.2');
    expect(Object.keys(idx.ct)).toContain('Type.Test.Root');
    expect(Object.keys(idx.st)).toContain('Test.CodeVals');
    // Nur nachricht.*-Elemente, alphabetisch sortiert.
    expect(r.idx.messages.map((m) => m.name)).toEqual([
      'nachricht.andere.0002',
      'nachricht.test.0001',
    ]);
  });

  it('particlesOfCT liefert die Sequenz-Partikel', () => {
    const cm = parser.particlesOfCT(idx.ct['Type.Test.Root']!, idx);
    expect(cm.model).toBe('sequence');
    expect(cm.simple).toBeFalse();
    expect(cm.parts.map((p) => p.getAttribute('name'))).toEqual(['beteiligung', 'datum', 'art']);
  });

  it('particlesOfCT vererbt Basispartikel bei extension', () => {
    const cm = parser.particlesOfCT(idx.ct['Type.Test.Sub']!, idx);
    expect(cm.parts.map((p) => p.getAttribute('name'))).toEqual(['name', 'extra']);
  });

  it('enumsOfST liest Werte inkl. wert-Label und documentation-Fallback', () => {
    const en = parser.enumsOfST(idx.st['Test.CodeVals']!, idx);
    expect(en).toEqual([
      { value: 'A', label: 'Apfel' },
      { value: 'B', label: 'Birne' },
    ]);
  });

  it('codelistOf zieht Metadaten und Werte aus dem Code.*-Typ', () => {
    const cl = parser.codelistOf('Code.Test', idx);
    expect(cl).not.toBeNull();
    expect(cl!.nameLang).toBe('Testliste');
    expect(cl!.kennung).toBe('urn:test:cl');
    expect(cl!.werte?.map((w) => w.value)).toEqual(['A', 'B']);
  });

  it('codelistOf ignoriert Nicht-Code-Typen', () => {
    expect(parser.codelistOf('Type.Test.Bet', idx)).toBeNull();
  });

  it('valueKind bildet Basistypen ab', () => {
    expect(parser.valueKind(node('date'), idx)).toBe('Datum');
    expect(parser.valueKind(node('string'), idx)).toBe('Text');
    expect(parser.valueKind(node('Type.Test.Bet'), idx)).toBe('Text');
    expect(parser.valueKind(node('Test.CodeVals'), idx)).toBe('Auswahlwert');
  });
});
