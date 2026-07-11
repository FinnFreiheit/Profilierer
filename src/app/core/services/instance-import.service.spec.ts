import { TestBed } from '@angular/core/testing';
import { InstanceImportService } from './instance-import.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="vorname" type="xs:string"/>
    <xs:element name="beteiligung" type="Type.Test.Bet" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="art" type="Code.Test"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Bet"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Code.Test">
    <xs:annotation><xs:appinfo><codeliste><nameLang>L</nameLang><kennung>urn:test:cl</kennung></codeliste></xs:appinfo></xs:annotation>
    <xs:sequence><xs:element name="code" type="Test.CodeVals"/></xs:sequence>
  </xs:complexType>
  <xs:simpleType name="Test.CodeVals"><xs:restriction base="xs:token">
    <xs:enumeration value="X1"/><xs:enumeration value="X2"/>
  </xs:restriction></xs:simpleType>
</xs:schema>`;

const INSTANCE = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.test.0001 xmlns="http://www.xjustiz.de">
  <vorname>Max</vorname>
  <beteiligung><name>A</name></beteiligung>
  <beteiligung><name>B</name></beteiligung>
  <art listURI="urn:test:cl" listVersionID="1"><code>X1</code></art>
</nachricht.test.0001>`;

describe('InstanceImportService', () => {
  let svc: InstanceImportService;
  let state: StateService;
  const M = 'nachricht.test.0001';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(InstanceImportService);
    state = TestBed.inject(StateService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    state.idx.set(parser.buildIndexFrom(docs).idx);
  });

  it('rootMessageName erkennt XJustiz-Nachrichten', () => {
    expect(InstanceImportService.rootMessageName(INSTANCE)).toBe(M);
    expect(InstanceImportService.rootMessageName('<CodeList/>')).toBeNull();
  });

  it('füllt Blatt-Testwerte und Codelisten-<code>', () => {
    svc.importXml(INSTANCE);
    expect(state.msgName()).toBe(M);
    expect(state.elemente()[`${M}/vorname`]?.beispiel).toBe('Max');
    expect(state.elemente()[`${M}/art`]?.beispiel).toBe('X1');
  });

  it('legt für 2 Vorkommen zwei Ausprägungen mit gefüllten Unterwerten an', () => {
    svc.importXml(INSTANCE);
    const ausps = state.auspsOf(`${M}/beteiligung`)!;
    expect(ausps.map((a) => a.name)).toEqual(['Vorkommen 1', 'Vorkommen 2']);
    expect(state.elemente()[`${M}/beteiligung@${ausps[0]!.id}/name`]?.beispiel).toBe('A');
    expect(state.elemente()[`${M}/beteiligung@${ausps[1]!.id}/name`]?.beispiel).toBe('B');
  });

  it('wirft ohne passendes Schema', () => {
    state.idx.set(null);
    expect(() => svc.importXml(INSTANCE)).toThrowError(/XSD-Ordner laden/);
  });
});
