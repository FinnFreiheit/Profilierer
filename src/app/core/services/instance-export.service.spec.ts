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
    <xs:element name="art2" type="Code.Test" minOccurs="0"/>
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
    <xs:element name="rolle" type="xs:string" minOccurs="0"/>
    <!-- Benanntes Element, dessen complexType *direkt* eine choice ist (wie
         die auswahl_*-Elemente im GDS): der Knoten traegt selbst model=choice. -->
    <xs:element name="auswahl_kennung"><xs:complexType><xs:choice>
      <xs:element name="kennungA" type="xs:string"/>
      <xs:element name="kennungB" type="xs:string"/>
    </xs:choice></xs:complexType></xs:element>
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
  <beteiligung><name>A</name><rolle>R1</rolle><auswahl_kennung><kennungA>KA</kennungA></auswahl_kennung></beteiligung>
  <beteiligung><name>B</name><auswahl_kennung><kennungB>KB</kennungB></auswahl_kennung></beteiligung>
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
  /** Werte der optionalen <rolle>-Blätter je <beteiligung> (null = nicht vorhanden). */
  const betRollen = (doc: Document): (string | null)[] =>
    all(doc, 'beteiligung').map((b) => b.getElementsByTagName('rolle')[0]?.textContent ?? null);
  /** Baut das Instanz-XML der laufenden Session und liefert es geparst. */
  const bau = (): Document =>
    new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    );

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

  it('fügt ein neues Vorkommen hinzu (frisch erzeugt, nicht geklont)', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    const neu = state.addAusp(`${M}/beteiligung`, 'Vorkommen 3');
    state.setElementProfile(`${M}/beteiligung@${neu}/name`, { beispiel: 'C' });
    const doc = bau();
    expect(betNamen(doc)).toEqual(['A', 'B', 'C']);
    // Das neue Vorkommen erbt keine Werte des ersten (kein Klon von "R1").
    expect(betRollen(doc)).toEqual(['R1', null, null]);
  });

  it('erzeugt das code-Element unqualifiziert (xmlns="") und bleibt reparsbar', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    // `art2` fehlt in der Quelle und wird beim Export frisch erzeugt.
    state.setElementProfile(`${M}/art2`, { beispiel: 'X2' });
    const xml = exp.buildInstanceXml(state.messageEdit()!, false);
    expect(xml).toContain('<code xmlns="">X2</code>');
    // Beim erneuten Parsen darf der Code nicht in den Default-Namespace rutschen.
    const art2 = new DOMParser()
      .parseFromString(xml, 'application/xml')
      .getElementsByTagName('art2')[0]!;
    expect(art2.getElementsByTagName('code')[0]!.namespaceURI).toBeNull();
  });

  // Bugfix: in einer Auswahl stand am Ende der **erste** Zweig im XML — und der
  // befuellte kam daneben. Im GDS hiess das: wer an einem Beteiligten die
  // Organisation befuellte, bekam `ra.kanzlei` UND `organisation`, und der
  // Validator meldete eine Nachricht als nicht schema-valide, die richtig war.
  describe('Auswahl: genau ein Zweig, und zwar der gemeinte', () => {
    /** Zweige der n-ten `auswahl_kennung` als "name=wert". */
    const zweige = (doc: Document, n: number): string[] =>
      Array.from(all(doc, 'auswahl_kennung')[n]!.children).map(
        (c) => `${c.localName}=${c.textContent}`,
      );

    it('schreibt im neuen Vorkommen den befuellten Zweig, nicht den ersten', () => {
      imp.importXml(INSTANCE, 'quelle.xml');
      const neu = state.addAusp(`${M}/beteiligung`, 'Vorkommen 3');
      state.setElementProfile(`${M}/beteiligung@${neu}/name`, { beispiel: 'C' });
      // Der Anwender befuellt den *zweiten* Zweig (wie „Organisation" im GDS).
      state.setElementProfile(`${M}/beteiligung@${neu}/auswahl_kennung/kennungB`, {
        beispiel: 'KB3',
      });

      expect(zweige(bau(), 2)).toEqual(['kennungB=KB3']);
    });

    it('wechselt den Zweig eines vorhandenen Vorkommens, statt beide zu schreiben', () => {
      imp.importXml(INSTANCE, 'quelle.xml');
      // Vorkommen 1 traegt kennungA aus der Quelle; der Anwender befuellt kennungB.
      const a1 = state.auspsOf(`${M}/beteiligung`)![0]!.id;
      state.setElementProfile(`${M}/beteiligung@${a1}/auswahl_kennung/kennungA`, {
        beispiel: undefined,
      });
      state.setElementProfile(`${M}/beteiligung@${a1}/auswahl_kennung/kennungB`, {
        beispiel: 'NEU',
      });

      expect(zweige(bau(), 0)).toEqual(['kennungB=NEU']);
    });

    it('folgt einem ausdruecklich ausgeschlossenen Zweig', () => {
      imp.importXml(INSTANCE, 'quelle.xml');
      const neu = state.addAusp(`${M}/beteiligung`, 'Vorkommen 3');
      state.setElementProfile(`${M}/beteiligung@${neu}/auswahl_kennung/kennungA`, {
        status: state.exclStatus()!.id,
      });

      expect(zweige(bau(), 2).map((z) => z.split('=')[0])).toEqual(['kennungB']);
    });

    it('gilt auch fuer eine unbenannte Auswahl (xs:choice in einer Sequenz)', () => {
      imp.importXml(INSTANCE, 'quelle.xml');
      // Die Quelle traegt <email>; der Anwender befuellt <telefon>.
      // Die Zweige einer unbenannten Auswahl tragen das Gruppensegment im Pfad.
      state.setElementProfile(`${M}/kontakt/_auswahl/email`, { beispiel: undefined });
      state.setElementProfile(`${M}/kontakt/_auswahl/telefon`, { beispiel: '030 123' });
      const kontakt = all(bau(), 'kontakt')[0]!;

      expect(Array.from(kontakt.children).map((c) => c.localName)).toEqual(['telefon']);
    });

    it('laesst den Zweig der Quelle stehen, wenn die Wahl mehrdeutig ist', () => {
      imp.importXml(INSTANCE, 'quelle.xml');
      // Beide Zweige befuellt, keiner gewaehlt: die vorhandene Nachricht gewinnt.
      const a1 = state.auspsOf(`${M}/beteiligung`)![0]!.id;
      state.setElementProfile(`${M}/beteiligung@${a1}/auswahl_kennung/kennungB`, {
        beispiel: 'ZWEITER',
      });

      expect(zweige(bau(), 0)).toEqual(['kennungA=KA']);
    });
  });

  it('erzeugt in einer benannten Auswahl genau einen Zweig', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    state.addAusp(`${M}/beteiligung`, 'Vorkommen 3');
    const neu = all(bau(), 'auswahl_kennung')[2]!;
    // `auswahl_kennung` traegt model=choice ohne synthetisches Kind — ohne
    // Sonderbehandlung entstuenden hier beide Zweige.
    expect(neu.children.length).toBe(1);
    expect(['kennungA', 'kennungB']).toContain(neu.children[0]!.localName);
  });

  it('erhält den Platzhalter eines erzeugten Vorkommens ohne Modellwert', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    state.addAusp(`${M}/beteiligung`, 'Vorkommen 3');
    const namen = betNamen(bau());
    expect(namen.length).toBe(3);
    // Pflichtblatt wurde erzeugt und darf nicht als "geleerter Wert" entfallen.
    expect(namen[2]).toBeTruthy();
  });

  it('entfernt eine Angabe, deren Wert im Modell geleert wurde', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    state.setElementProfile(`${M}/vorname`, { beispiel: undefined });
    const doc = bau();
    expect(all(doc, 'vorname').length).toBe(0);
    // Unangetastete Geschwister bleiben erhalten.
    expect(betNamen(doc)).toEqual(['A', 'B']);
    expect(txt(doc, 'code')).toBe('X1');
  });

  it('überträgt beim Löschen des ersten Vorkommens dessen Werte nicht', () => {
    imp.importXml(INSTANCE, 'quelle.xml');
    const ausps = state.auspsOf(`${M}/beteiligung`)!;
    state.removeAusp(`${M}/beteiligung`, ausps[0]!.id); // "A" samt <rolle>R1</rolle>
    const doc = bau();
    expect(betNamen(doc)).toEqual(['B']);
    expect(betRollen(doc)).toEqual([null]);
  });

  it('erhält beim Duplizieren eines einzelnen Vorkommens dessen Quell-Inhalt', () => {
    const EINS = INSTANCE.replace(/ *<beteiligung><name>B<\/name>.*<\/beteiligung>\n/, '');
    expect(EINS).not.toContain('<name>B</name>'); // Replace muss gegriffen haben
    imp.importXml(EINS, 'quelle.xml');
    state.duplicateElement(`${M}/beteiligung`); // Fall 1 erbt A/R1, Fall 2 ist neu
    const doc = bau();
    expect(betNamen(doc)[0]).toBe('A');
    expect(betRollen(doc)).toEqual(['R1', null]);
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

/**
 * Der gemeldete Fall in der Form des Grunddatensatzes: `auswahl_beteiligter`
 * mit drei Zweigen, jeder ein eigener Typ mit Pflichtkind. Wer an einer neuen
 * Beteiligung die **Organisation** befuellt, bekam bis zum Bugfix zusaetzlich
 * eine leere `ra.kanzlei` davor — xmllint meldete daraufhin
 * „Element 'organisation': This element is not expected." an einer Nachricht,
 * die der Anwender voellig richtig gebaut hatte.
 */
describe('InstanceExportService — auswahl_beteiligter (Form des GDS)', () => {
  const GDS_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.gds" type="Type.Root"/>
  <xs:complexType name="Type.Root"><xs:sequence>
    <xs:element name="beteiligung" maxOccurs="unbounded"><xs:complexType><xs:sequence>
      <xs:element name="beteiligtennummer" type="xs:string" minOccurs="0"/>
      <xs:element name="auswahl_beteiligter"><xs:complexType><xs:choice>
        <xs:element name="ra.kanzlei"><xs:complexType><xs:sequence>
          <xs:element name="kanzleiname" type="xs:string"/>
        </xs:sequence></xs:complexType></xs:element>
        <xs:element name="natuerlichePerson"><xs:complexType><xs:sequence>
          <xs:element name="nachname" type="xs:string"/>
        </xs:sequence></xs:complexType></xs:element>
        <xs:element name="organisation"><xs:complexType><xs:sequence>
          <xs:element name="bezeichnung.aktuell" type="xs:string"/>
        </xs:sequence></xs:complexType></xs:element>
      </xs:choice></xs:complexType></xs:element>
    </xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
</xs:schema>`;

  const GDS_INSTANCE = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.test.gds xmlns="http://www.xjustiz.de">
  <beteiligung>
    <beteiligtennummer>1</beteiligtennummer>
    <auswahl_beteiligter><natuerlichePerson><nachname>Schott</nachname></natuerlichePerson></auswahl_beteiligter>
  </beteiligung>
  <beteiligung>
    <beteiligtennummer>2</beteiligtennummer>
    <auswahl_beteiligter><ra.kanzlei><kanzleiname>Muster &amp; Partner</kanzleiname></ra.kanzlei></auswahl_beteiligter>
  </beteiligung>
</nachricht.test.gds>`;

  const G = 'nachricht.test.gds';
  let imp: InstanceImportService;
  let exp: InstanceExportService;
  let state: StateService;

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
    const dom = new DOMParser().parseFromString(GDS_XSD, 'application/xml');
    state.idx.set(parser.buildIndexFrom([{ file: 'gds.xsd', dom }]).idx);
  });

  /** Zweige je `auswahl_beteiligter` im erzeugten XML. */
  function zweige(): string[][] {
    const doc = new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    );
    return Array.from(doc.getElementsByTagName('auswahl_beteiligter')).map((a) =>
      Array.from(a.children).map((c) => c.localName),
    );
  }

  it('schreibt an der zusaetzlichen Beteiligung nur die Organisation', () => {
    imp.importXml(GDS_INSTANCE, 'forderungsaufstellung.xml');
    const neu = state.addAusp(`${G}/beteiligung`, 'Vorkommen 3');
    state.setElementProfile(
      `${G}/beteiligung@${neu}/auswahl_beteiligter/organisation/bezeichnung.aktuell`,
      {
        beispiel: 'Muster GmbH',
      },
    );

    expect(zweige()).toEqual([['natuerlichePerson'], ['ra.kanzlei'], ['organisation']]);
  });

  it('laesst die bestehenden Beteiligungen dabei unberuehrt', () => {
    imp.importXml(GDS_INSTANCE, 'forderungsaufstellung.xml');
    const neu = state.addAusp(`${G}/beteiligung`, 'Vorkommen 3');
    state.setElementProfile(
      `${G}/beteiligung@${neu}/auswahl_beteiligter/organisation/bezeichnung.aktuell`,
      {
        beispiel: 'Muster GmbH',
      },
    );
    const doc = new DOMParser().parseFromString(
      exp.buildInstanceXml(state.messageEdit()!, false),
      'application/xml',
    );

    expect(doc.getElementsByTagName('nachname')[0]?.textContent).toBe('Schott');
    expect(doc.getElementsByTagName('kanzleiname')[0]?.textContent).toBe('Muster & Partner');
    expect(doc.getElementsByTagName('bezeichnung.aktuell')[0]?.textContent).toBe('Muster GmbH');
  });
});
