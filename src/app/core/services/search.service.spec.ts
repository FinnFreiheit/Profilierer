import { TestBed } from '@angular/core/testing';
import { SearchService } from './search.service';
import { InstanceImportService } from './instance-import.service';
import { NavService } from './nav.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="aktenzeichen" type="xs:string"/>
    <xs:element name="vorname" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const INSTANCE = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.test.0001 xmlns="http://www.xjustiz.de">
  <aktenzeichen>12 O 345/26</aktenzeichen>
  <vorname>Max</vorname>
</nachricht.test.0001>`;

describe('SearchService', () => {
  let search: SearchService;
  let state: StateService;
  const M = 'nachricht.test.0001';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    search = TestBed.inject(SearchService);
    state = TestBed.inject(StateService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    state.idx.set(parser.buildIndexFrom(docs).idx);
    TestBed.inject(InstanceImportService).importXml(INSTANCE);
  });

  it('indexiert die belegten Werte', () => {
    const entry = search.index().find((e) => e.path === `${M}/aktenzeichen`);
    expect(entry?.value).toBe('12 O 345/26');
  });

  it('findet Elemente ueber ihren Inhalt (Aktenzeichen)', () => {
    const hits = search.run('345');
    expect(hits.some((h) => h.path === `${M}/aktenzeichen`)).toBeTrue();
  });

  it('findet Elemente weiterhin ueber Label/Struktur', () => {
    const hits = search.run('vorname');
    expect(hits.some((h) => h.path === `${M}/vorname`)).toBeTrue();
  });
});

/** Katalog-Schema der zentralen Suche: Nachricht, fachliche Typen, Codeliste. */
const XSD_KATALOG = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.gds.uebermittlungAkte.0005005" type="Type.GDS.Nachricht">
    <xs:annotation><xs:documentation>Uebermittlung einer Akte.</xs:documentation></xs:annotation>
  </xs:element>
  <xs:complexType name="Type.GDS.Nachricht">
    <xs:sequence><xs:element name="hersteller" type="Type.GDS.Herstellerinformation"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.GDS.Herstellerinformation">
    <xs:sequence><xs:element name="produktname" type="xs:string"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Code.GDS.Aktentyp">
    <xs:sequence><xs:element name="code" type="xs:token"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;

describe('SearchService — runZentral (zentrale Suche)', () => {
  let search: SearchService;
  let state: StateService;
  const M = 'nachricht.gds.uebermittlungAkte.0005005';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    search = TestBed.inject(SearchService);
    state = TestBed.inject(StateService);
    const dom = new DOMParser().parseFromString(XSD_KATALOG, 'application/xml');
    state.idx.set(
      TestBed.inject(XsdParserService).buildIndexFrom([{ file: 'katalog.xsd', dom }]).idx,
    );
  });

  it('findet Nachricht und Datentyp ohne geladenen Baum', () => {
    expect(state.root()).toBeNull();
    const t = search.runZentral('hersteller');
    expect(t.baum).toEqual([]);
    expect(t.typen.map((e) => e.name)).toEqual(['Type.GDS.Herstellerinformation']);

    const n = search.runZentral('uebermittlung');
    expect(n.nachrichten.map((m) => m.name)).toEqual([M]);
  });

  it('fuehrt die Codelisten mit', () => {
    expect(search.runZentral('Code.GDS').typen.map((e) => e.name)).toEqual(['Code.GDS.Aktentyp']);
  });

  it('nimmt mit geladenem Baum die Baum-Sektion dazu', () => {
    TestBed.inject(NavService).loadMessage(M);
    const t = search.runZentral('hersteller');
    expect(t.baum.map((e) => e.path)).toEqual([`${M}/hersteller`]);
    expect(t.typen.map((e) => e.name)).toEqual(['Type.GDS.Herstellerinformation']);
  });

  it('liefert bei leerer Eingabe nichts', () => {
    expect(search.runZentral('  ')).toEqual({ baum: [], nachrichten: [], typen: [] });
  });
});
