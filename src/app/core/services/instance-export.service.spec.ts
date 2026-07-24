import { TestBed } from '@angular/core/testing';
import { InstanceImportService } from './instance-import.service';
import { InstanceExportService } from './instance-export.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { CodelistService } from './codelist.service';
import { XsdDoc } from '../../models/xsd-index.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="nachrichtenkopf" type="Type.Test.Kopf"/>
    <xs:element name="vorname" type="xs:string"/>
    <xs:element name="spitzname" type="xs:string" minOccurs="0"/>
    <xs:element name="beteiligung" type="Type.Test.Bet" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="art" type="Code.Test"/>
    <xs:element name="kontakt" minOccurs="0"><xs:complexType><xs:sequence>
      <xs:element name="anrede" type="xs:string" minOccurs="0"/>
      <xs:choice>
        <xs:element name="email" type="xs:string"/>
        <xs:element name="telefon" type="xs:string"/>
      </xs:choice>
    </xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Kopf"><xs:sequence>
    <xs:element name="erstellungszeitpunkt" type="xs:dateTime"/>
    <xs:element name="absender"><xs:complexType><xs:sequence>
      <xs:element name="eigeneNachrichtenID" type="xs:string"/>
    </xs:sequence></xs:complexType></xs:element>
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
  <nachrichtenkopf>
    <erstellungszeitpunkt>2020-01-01T00:00:00</erstellungszeitpunkt>
    <absender><eigeneNachrichtenID>ALT-ID-123</eigeneNachrichtenID></absender>
  </nachrichtenkopf>
  <vorname>Max</vorname>
  <beteiligung><name>A</name></beteiligung>
  <beteiligung><name>B</name></beteiligung>
  <art listURI="urn:test:cl" listVersionID="1"><code>X1</code></art>
  <kontakt><email>max@example.org</email></kontakt>
</nachricht.test.0001>`;

describe('InstanceExportService', () => {
  let imp: InstanceImportService;
  let exp: InstanceExportService;
  let state: StateService;
  const M = 'nachricht.test.0001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CodelistService, useValue: { ensureUsedCodelists: () => Promise.resolve() } },
      ],
    });
    imp = TestBed.inject(InstanceImportService);
    exp = TestBed.inject(InstanceExportService);
    state = TestBed.inject(StateService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    state.idx.set(parser.buildIndexFrom(docs).idx);
  });

  /** Importiert INSTANCE und liefert das re-exportierte, geparste DOM. */
  function roundtrip(neueKopfdaten = false): Document {
    imp.importXml(INSTANCE, 'quelle.xml');
    const xml = exp.buildInstanceXml(state.messageEdit()!, neueKopfdaten);
    return new DOMParser().parseFromString(xml, 'application/xml');
  }

  const txt = (doc: Document, name: string): string | undefined =>
    doc.getElementsByTagName(name)[0]?.textContent ?? undefined;
  const all = (doc: Document, name: string): Element[] =>
    Array.from(doc.getElementsByTagName(name));
  /** Werte der <name>-Blätter je <beteiligung> (Reihenfolge). */
  const betNamen = (doc: Document): (string | null)[] =>
    all(doc, 'beteiligung').map((b) => b.getElementsByTagName('name')[0]?.textContent ?? null);

  it('erzeugt wohlgeformtes XML ohne Parserfehler', () => {
    const doc = roundtrip();
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    expect(doc.documentElement.localName).toBe(M);
  });

  it('bleibt beim reinen Roundtrip werttreu', () => {
    const doc = roundtrip();
    expect(txt(doc, 'vorname')).toBe('Max');
    expect(betNamen(doc)).toEqual(['A', 'B']);
    expect(txt(doc, 'code')).toBe('X1');
  });

  it('erhält Codelisten-Attribute (listURI/listVersionID) unangetastet', () => {
    const art = roundtrip().getElementsByTagName('art')[0]!;
    expect(art.getAttribute('listURI')).toBe('urn:test:cl');
    expect(art.getAttribute('listVersionID')).toBe('1');
  });

  it('lässt den Default-Namespace erhalten', () => {
    expect(roundtrip().documentElement.namespaceURI).toBe('http://www.xjustiz.de');
  });

  it('pflegt einen geänderten Blattwert ein, Rest bleibt', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });
    const doc = new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    );
    expect(txt(doc, 'vorname')).toBe('Erika');
    expect(betNamen(doc)).toEqual(['A', 'B']);
  });

  it('ändert einen Codelisten-Code und behält die Attribute', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    state.setElementProfile(`${M}/art`, { beispiel: 'X2' });
    const art = new DOMParser()
      .parseFromString(exp.buildInstanceXml(state.messageEdit()!, false), 'application/xml')
      .getElementsByTagName('art')[0]!;
    expect(art.getElementsByTagName('code')[0]?.textContent).toBe('X2');
    expect(art.getAttribute('listURI')).toBe('urn:test:cl');
  });

  it('entfernt ein überzähliges Vorkommen (Ausprägung gelöscht)', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    const ausps = state.auspsOf(`${M}/beteiligung`)!;
    state.removeAusp(`${M}/beteiligung`, ausps[1]!.id); // "B" entfernen
    const doc = new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    );
    expect(betNamen(doc)).toEqual(['A']);
  });

  it('verschiebt Werte korrekt, wenn das erste Vorkommen gelöscht wird', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    const ausps = state.auspsOf(`${M}/beteiligung`)!;
    state.removeAusp(`${M}/beteiligung`, ausps[0]!.id); // "A" (Vorkommen 1) entfernen
    const doc = new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    );
    // Verbleibt Vorkommen 2 mit Wert "B" — der Wert-Patch korrigiert das Positions-Mapping.
    expect(betNamen(doc)).toEqual(['B']);
  });

  it('fügt ein neues Vorkommen hinzu (aus Vorlage geklont)', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    const neu = state.addAusp(`${M}/beteiligung`, 'Vorkommen 3');
    state.setElementProfile(`${M}/beteiligung@${neu}/name`, { beispiel: 'C' });
    const doc = new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    );
    expect(betNamen(doc)).toEqual(['A', 'B', 'C']);
  });

  it('fügt ein neues optionales Blatt an schema-korrekter Position ein', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    state.setElementProfile(`${M}/spitzname`, { beispiel: 'Maxi' });
    const root = new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    ).documentElement;
    const namen = Array.from(root.children).map((c) => c.localName);
    // spitzname steht laut Schema zwischen vorname und beteiligung.
    expect(namen.indexOf('spitzname')).toBeGreaterThan(namen.indexOf('vorname'));
    expect(namen.indexOf('spitzname')).toBeLessThan(namen.indexOf('beteiligung'));
    expect(txt(root.ownerDocument, 'spitzname')).toBe('Maxi');
  });

  it('erhält einen choice-Zweig treu und patcht dessen Wert', () => {
    // email liegt in einer choice-Gruppe (synthetisch) unter kontakt.
    expect(txt(roundtrip(), 'email')).toBe('max@example.org');
    // Wert ändern → nur der Text ändert sich, der choice-Zweig bleibt.
    imp.importXml(INSTANCE, 'quelle.xml');
    state.setElementProfile(`${M}/kontakt/_auswahl/email`, { beispiel: 'neu@example.org' });
    const doc = new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    );
    expect(txt(doc, 'email')).toBe('neu@example.org');
    expect(doc.getElementsByTagName('telefon').length).toBe(0);
  });

  it('vergibt bei „neuer Nachricht" frische Kopfdaten', () => {
    const doc = roundtrip(true);
    expect(txt(doc, 'eigeneNachrichtenID')).not.toBe('ALT-ID-123');
    expect(txt(doc, 'eigeneNachrichtenID')).toMatch(/^[0-9a-f-]{36}$/);
    expect(txt(doc, 'erstellungszeitpunkt')).not.toBe('2020-01-01T00:00:00');
  });

  it('behält die Kopfdaten bei neueKopfdaten=false', () => {
    const doc = roundtrip(false);
    expect(txt(doc, 'eigeneNachrichtenID')).toBe('ALT-ID-123');
    expect(txt(doc, 'erstellungszeitpunkt')).toBe('2020-01-01T00:00:00');
  });
});
