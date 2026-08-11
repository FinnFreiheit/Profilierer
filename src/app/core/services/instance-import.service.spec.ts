import { TestBed } from '@angular/core/testing';
import { InstanceImportService } from './instance-import.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { CodelistService } from './codelist.service';
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

/**
 * Zweites Schema fuer die Verweis-Faelle: ein Traeger je Verweis-Art
 * (`Type.GDS.Ref.*`) und die zugehoerigen Ziele mit ihren Kennungen — die
 * Rollennummer eine Ebene tiefer unter `rolle`, die UUID des Dokuments unter
 * `identifikation/id`.
 */
const REF_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0002" type="Type.Test.Root2"/>
  <xs:complexType name="Type.Test.Root2"><xs:sequence>
    <xs:element name="verweis" type="Type.GDS.Ref.Rollennummer"/>
    <xs:element name="bezugsdokument" type="Type.GDS.Ref.SGO"/>
    <xs:element name="beteiligung" type="Type.Test.Bet2" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="dokument" type="Type.Test.Dok" minOccurs="0" maxOccurs="unbounded"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.GDS.Ref.Rollennummer"><xs:sequence>
    <xs:element name="ref.rollennummer" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.GDS.Ref.SGO"><xs:sequence>
    <xs:element name="ref.sgo" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Bet2"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
    <xs:element name="rolle"><xs:complexType><xs:sequence>
      <xs:element name="rollennummer" type="xs:string"/>
    </xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Dok"><xs:sequence>
    <xs:element name="identifikation"><xs:complexType><xs:sequence>
      <xs:element name="id" type="xs:string"/>
    </xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const REF_INSTANCE = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.test.0002 xmlns="http://www.xjustiz.de">
  <verweis><ref.rollennummer>8</ref.rollennummer></verweis>
  <bezugsdokument><ref.sgo>uuid-2</ref.sgo></bezugsdokument>
  <beteiligung><name>A</name><rolle><rollennummer>7</rollennummer></rolle></beteiligung>
  <beteiligung><name>B</name><rolle><rollennummer>8</rollennummer></rolle></beteiligung>
  <dokument><identifikation><id>uuid-1</id></identifikation></dokument>
  <dokument><identifikation><id>uuid-2</id></identifikation></dokument>
</nachricht.test.0002>`;

describe('InstanceImportService', () => {
  let svc: InstanceImportService;
  let state: StateService;
  const M = 'nachricht.test.0001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      // Kein Netz im Test: den automatischen Codelisten-Vorabruf stillstellen.
      providers: [
        { provide: CodelistService, useValue: { ensureUsedCodelists: () => Promise.resolve() } },
      ],
    });
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

  it('startet die importierte Nachricht im Betrachtungsmodus mit nur-Werte', () => {
    svc.importXml(INSTANCE);
    expect(state.readOnly()).toBeTrue();
    expect(state.onlyValues()).toBeTrue();
  });

  it('legt die Session ohne Testspeicher-Eintrag an (Datei-Upload)', () => {
    svc.importXml(INSTANCE, 'quelle.xml');
    expect(state.messageEdit()!.entryId).toBeNull();
  });

  it('merkt sich zu jeder Ausprägung das zugehörige Quell-Vorkommen', () => {
    svc.importXml(INSTANCE);
    const ausps = state.auspsOf(`${M}/beteiligung`)!;
    const idx = state.messageEdit()!.vorkommenIndex;
    expect(idx.get(`${M}/beteiligung@${ausps[0]!.id}`)).toBe(0);
    expect(idx.get(`${M}/beteiligung@${ausps[1]!.id}`)).toBe(1);
  });

  describe('Verweise', () => {
    const R = 'nachricht.test.0002';

    beforeEach(() => {
      const parser = TestBed.inject(XsdParserService);
      const dom = new DOMParser().parseFromString(REF_XSD, 'application/xml');
      state.idx.set(parser.buildIndexFrom([{ file: 'xjustiz_0000_ref.xsd', dom }]).idx);
    });

    it('führt eine Rollennummer auf das Vorkommen zurück, das sie trägt', () => {
      svc.importXml(REF_INSTANCE);
      const bet = state.auspsOf(`${R}/beteiligung`)!;
      expect(state.elemente()[`${R}/verweis`]?.refZiel).toBe(`${R}/beteiligung@${bet[1]!.id}`);
    });

    it('führt einen SGO-Verweis über die UUID auf sein Dokument zurück', () => {
      svc.importXml(REF_INSTANCE);
      const dok = state.auspsOf(`${R}/dokument`)!;
      expect(state.elemente()[`${R}/bezugsdokument`]?.refZiel).toBe(`${R}/dokument@${dok[1]!.id}`);
    });

    it('legt auch für ein einzelnes Vorkommen eine Ausprägung an, wenn ein Verweis darauf zeigt', () => {
      const eins = REF_INSTANCE.replace(
        '<beteiligung><name>A</name><rolle><rollennummer>7</rollennummer></rolle></beteiligung>\n  ',
        '',
      );
      svc.importXml(eins);
      const bet = state.auspsOf(`${R}/beteiligung`)!;
      expect(bet.length).toBe(1);
      expect(state.elemente()[`${R}/verweis`]?.refZiel).toBe(`${R}/beteiligung@${bet[0]!.id}`);
    });

    it('lässt ein einzelnes Vorkommen ohne Verweis darauf unangetastet', () => {
      const ohne = REF_INSTANCE.replace(
        '<dokument><identifikation><id>uuid-1</id></identifikation></dokument>\n  ',
        '',
      ).replace('<ref.sgo>uuid-2<', '<ref.sgo>fremd<');
      svc.importXml(ohne);
      expect(state.auspsOf(`${R}/dokument`)).toBeFalsy();
      expect(state.elemente()[`${R}/dokument/identifikation/id`]?.beispiel).toBe('uuid-2');
    });

    it('lässt den Verweis ohne passendes Ziel offen — der Wert bleibt', () => {
      svc.importXml(REF_INSTANCE.replace('<ref.rollennummer>8<', '<ref.rollennummer>99<'));
      expect(state.elemente()[`${R}/verweis`]?.refZiel).toBeUndefined();
      expect(state.elemente()[`${R}/verweis/ref.rollennummer`]?.beispiel).toBe('99');
    });
  });
});
