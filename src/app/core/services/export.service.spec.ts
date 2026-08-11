import { TestBed } from '@angular/core/testing';
import { ExportService } from './export.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { XsdParserService } from './xsd-parser.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';
import { XmlValidationService, XmlValidierung } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { HinweisStoreService } from './hinweis-store.service';
import { XsdDoc } from '../../models/xsd-index.model';
import { ERW_SPERRE_GRUND } from '../util/erweiterung-sperre';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
    <xs:element name="farbe" type="Code.Test.Farbe" minOccurs="0"/>
    <xs:element name="versionskopf" type="Type.Test.Kopf" minOccurs="0"/>
    <xs:element name="neuerKopf" type="Type.Test.Kopf40" minOccurs="0"/>
    <xs:choice>
      <xs:element name="email" type="xs:string"/>
      <xs:element name="telefon" type="xs:string"/>
    </xs:choice>
    <xs:sequence minOccurs="0">
      <xs:element name="detail" type="xs:string"/>
    </xs:sequence>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Code.Test.Farbe">
    <xs:annotation><xs:appinfo>
      <codeliste><kennung>urn:test:farbe</kennung></codeliste>
      <versionCodeliste><version>8.8</version></versionCodeliste>
    </xs:appinfo></xs:annotation>
    <xs:complexContent><xs:restriction base="code:Code">
      <xs:sequence><xs:element name="code" type="xs:token"/></xs:sequence>
      <xs:attribute name="listURI" type="xs:anyURI" use="optional" fixed="urn:test:farbe"/>
      <xs:attribute name="listVersionID" type="xs:normalizedString" use="optional" fixed="9.9"/>
    </xs:restriction></xs:complexContent>
  </xs:complexType>
  <xs:complexType name="Type.Test.Kopf">
    <xs:sequence><xs:element name="titel" type="xs:string"/></xs:sequence>
    <xs:attribute name="xjustizVersion" type="xs:string" use="required" fixed="3.6.2"/>
    <xs:attribute name="optionales" type="xs:string" use="optional"/>
  </xs:complexType>
  <!-- Wie ab XJustiz 4.0.0: Pflicht-Attribut ohne fixed, Wert per Typ/Pattern. -->
  <xs:complexType name="Type.Test.Kopf40">
    <xs:sequence><xs:element name="titel" type="xs:string"/></xs:sequence>
    <xs:attribute name="xjustizVersion" type="Type.Test.XJustizVersion" use="required"/>
    <xs:attribute name="sonstiges" type="xs:string" use="required"/>
  </xs:complexType>
  <xs:simpleType name="Type.Test.XJustizVersion">
    <xs:restriction base="xs:string">
      <xs:pattern value="4\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>`;

const M = 'nachricht.test.0001';

describe('ExportService (Schematron)', () => {
  let svc: ExportService;
  let state: StateService;
  let downloaded: { name: string; content: string }[];
  let toasts: string[];
  /** Stub-Ergebnis der Schemavalidierung (Export-Tor); Tests schalten um. */
  let pruefung: XmlValidierung;

  beforeEach(() => {
    downloaded = [];
    toasts = [];
    pruefung = { status: 'valide', fehler: [], fehlerDetails: [] };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DownloadService,
          useValue: {
            download: (name: string, content: string) => downloaded.push({ name, content }),
            profilFilename: (ext: string) => 'test.' + ext,
          },
        },
        { provide: ToastService, useValue: { show: (t: string) => toasts.push(t) } },
        { provide: XmlValidationService, useValue: { validiere: async () => pruefung } },
      ],
    });
    svc = TestBed.inject(ExportService);
    state = TestBed.inject(StateService);
    const tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    const idx = parser.buildIndexFrom(docs).idx;
    state.idx.set(idx);
    state.root.set(tree.buildRoot(M, idx));
    state.msgName.set(M);
  });

  const sch = (): string => downloaded[0]!.content;

  it('schreibt die Freitext-Festlegung als Kommentar zur Regel', () => {
    state.setElementProfile(`${M}/az`, { status: 's1', anmerkung: 'nur bei Auslandsbezug' });
    svc.exportSchematron();
    expect(sch()).toContain('<!-- Festlegung zu "az": nur bei Auslandsbezug -->');
    // Kommentar steht vor der zugehoerigen Regel (gleicher Kontext wie der Pflicht-Assert).
    expect(sch().indexOf('Festlegung zu "az"')).toBeLessThan(
      sch().indexOf('<sch:assert test="xj:az">'),
    );
  });

  it('gibt Festlegungen ohne pruefbare Regel als Kommentar mit Kontext aus', () => {
    state.setElementProfile(`${M}/az`, { status: 's2', anmerkung: 'abgestimmt mit BLK' });
    svc.exportSchematron();
    expect(sch()).toContain('Festlegung zu "az": abgestimmt mit BLK');
    expect(sch()).toContain('(Kontext:');
  });

  it('entschaerft "--" in Kommentaren (XML-Kommentar-Verbot)', () => {
    state.setElementProfile(`${M}/az`, { status: 's1', anmerkung: 'A -- B ---- C' });
    svc.exportSchematron();
    const kommentar = sch()
      .split('\n')
      .find((l) => l.includes('Festlegung zu "az"'))!;
    const inner = kommentar.replace(/^\s*<!--\s?/, '').replace(/\s?-->\s*$/, '');
    expect(inner).not.toContain('--'); // Kommentar-Inhalt ohne verbotenes Doppelminus
    expect(kommentar).toContain('A – B – C');
  });

  it('erzeugt keine Kommentar-Duplikate', () => {
    state.setElementProfile(`${M}/az`, { status: 's1', anmerkung: 'einmalig' });
    svc.exportSchematron();
    expect(sch().split('einmalig').length - 1).toBe(1);
  });

  it('exportiert ohne Anmerkungen unveraendert (kein Kommentar-Block)', () => {
    state.setElementProfile(`${M}/az`, { status: 's1' });
    svc.exportSchematron();
    expect(sch()).not.toContain('Festlegung zu');
    expect(sch()).toContain('<sch:assert test="xj:az">');
  });

  it('emittiert nichts aus ausgeschlossenen Teilbaeumen (schlummernder Status, Regression)', () => {
    state.setElementProfile(`${M}/versionskopf`, { status: 's3' });
    state.setElementProfile(`${M}/versionskopf/titel`, { status: 's1', anmerkung: 'schlummert' });
    svc.exportSchematron();
    expect(sch()).not.toContain('xj:titel');
    expect(sch()).not.toContain('schlummert');
  });

  it('Hinweise tauchen weder im Schematron noch im Beispiel-XML auf', () => {
    state.setElementProfile(`${M}/az`, { status: 's1' });
    TestBed.inject(HinweisStoreService).hinweise.set([
      { id: 'h1', pfad: `${M}/az`, text: 'INTERN-GEHEIM', zeit: 1 },
    ]);
    svc.exportSchematron();
    expect(sch()).not.toContain('INTERN-GEHEIM');
    expect(svc.buildBeispielXml()).not.toContain('INTERN-GEHEIM');
  });

  describe('Beispiel-XML (buildBeispielXml/genBeispielXml)', () => {
    it('baut den XML-String mit Root und Pflichtelementen', () => {
      const xml = svc.buildBeispielXml();
      expect(xml).not.toBeNull();
      expect(xml).toContain(`<${M} xmlns=`);
      expect(xml).toContain('<kopf>'); // minOccurs 1
      expect(xml).not.toContain('<az>'); // optional, unprofiliert
    });

    it('nimmt profilierte optionale Elemente auf und laesst ausgeschlossene weg', () => {
      state.setElementProfile(`${M}/az`, { beispiel: '4711' });
      expect(svc.buildBeispielXml()).toContain('<az>4711</az>');
      state.setElementProfile(`${M}/az`, { status: 's3', beispiel: undefined });
      expect(svc.buildBeispielXml()).not.toContain('<az>');
    });

    it('emittiert nichts aus ausgeschlossenen Teilbaeumen (schlummernder Status, Regression)', () => {
      state.setElementProfile(`${M}/versionskopf`, { status: 's3' });
      state.setElementProfile(`${M}/versionskopf/titel`, { status: 's1', beispiel: 'SCHLUMMER' });
      const xml = svc.buildBeispielXml()!;
      expect(xml).not.toContain('<versionskopf');
      expect(xml).not.toContain('SCHLUMMER');
    });

    it('liefert null ohne geladene Nachricht', () => {
      state.root.set(null);
      expect(svc.buildBeispielXml()).toBeNull();
    });

    it('genBeispielXml laedt denselben Inhalt herunter (Regression fuer den Split)', async () => {
      const xml = svc.buildBeispielXml()!;
      await svc.genBeispielXml();
      expect(downloaded.length).toBe(1);
      expect(downloaded[0]!.content).toBe(xml);
      expect(downloaded[0]!.name).toBe('test.beispiel.xml');
    });

    it('schreibt code-Elemente unqualifiziert (xmlns="") mit fixer listVersionID aus dem Schema', () => {
      state.setElementProfile(`${M}/farbe`, { status: 's1' });
      const xml = svc.buildBeispielXml()!;
      expect(xml).toContain('<farbe listURI="urn:test:farbe" listVersionID="9.9">');
      expect(xml).toContain('<code xmlns="">');
      expect(xml).not.toContain('listVersionID="~"');
    });

    it('setzt fixe Pflicht-Attribute aus dem Schema (z. B. xjustizVersion am Kopf)', () => {
      state.setElementProfile(`${M}/versionskopf`, { status: 's1' });
      const xml = svc.buildBeispielXml()!;
      expect(xml).toContain('<versionskopf xjustizVersion="3.6.2">');
    });

    // Ab 4.0.0 traegt xjustizVersion kein fixed mehr; ohne diesen Zweig fehlte
    // das Pflicht-Attribut und jede erzeugte 4.x-Nachricht waere invalide.
    it('setzt xjustizVersion ohne fixed aus der geladenen Schemaversion (ab 4.0.0)', () => {
      state.version.set('4.0.0');
      state.setElementProfile(`${M}/neuerKopf`, { status: 's1' });
      const xml = svc.buildBeispielXml()!;
      expect(xml).toContain('<neuerKopf xjustizVersion="4.0.0"');
    });

    // Pflicht-Attribute sind im Baum nicht erfassbar: ohne Wert bliebe die
    // Nachricht dauerhaft schema-invalide. Darum ein typkonformer Platzhalter —
    // dieselbe Zusage wie bei den Blattwerten des Beispiel-XML.
    it('belegt Pflicht-Attribute ohne ableitbaren Wert typkonform', () => {
      state.version.set('4.0.0');
      state.setElementProfile(`${M}/neuerKopf`, { status: 's1' });
      expect(svc.buildBeispielXml()!).toContain('sonstiges="Beispieltext"');
    });

    it('laesst optionale Attribute weg', () => {
      state.setElementProfile(`${M}/versionskopf`, { status: 's1' });
      expect(svc.buildBeispielXml()!).not.toContain('optionales=');
    });

    // Die Zuordnung, die veroeffentlichte XJustiz-Nachrichten tragen: ohne sie
    // findet ein fremdes Pruefwerkzeug das Schema nicht.
    it('schreibt xsi:schemaLocation auf die Schemadatei des Nachrichtentyps', () => {
      const xml = svc.buildBeispielXml()!;
      expect(xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
      expect(xml).toContain('xsi:schemaLocation="http://www.xjustiz.de xjustiz_0000_test.xsd"');
    });

    it('genBeispielXml blockiert invalide Nachrichten mit Bericht (Export-Tor)', async () => {
      pruefung = {
        status: 'invalide',
        fehler: ['Zeile 3: kopf fehlt'],
        fehlerDetails: [{ text: 'Zeile 3: kopf fehlt', zeile: 3 }],
      };
      await svc.genBeispielXml();
      expect(downloaded.length).toBe(0);
      const report = TestBed.inject(ValidationReportService);
      expect(report.offen()).toBeTrue();
      expect(report.eintraege().map((e) => e.text)).toEqual(['Zeile 3: kopf fehlt']);
    });

    it('genBeispielXml markiert Fehler im Baum und macht Eintraege klickbar', async () => {
      // Zeile 5 ist das kopf-Blatt (1 Deklaration + 2 Praeambel + Root-Open).
      pruefung = {
        status: 'invalide',
        fehler: ['Zeile 5: kopf falsch belegt'],
        fehlerDetails: [{ text: 'Zeile 5: kopf falsch belegt', zeile: 5 }],
      };
      await svc.genBeispielXml();
      const report = TestBed.inject(ValidationReportService);
      expect(report.eintraege()[0]!.pfad).toBe(`${M}/kopf`);
      expect(state.valFehler()?.get(`${M}/kopf`)).toEqual(['Zeile 5: kopf falsch belegt']);
      expect(state.valAnc()?.get(M)).toBe(1);
    });

    it('ein valider Lauf raeumt die Marker des vorherigen Laufs', async () => {
      state.valFehler.set(new Map([[`${M}/kopf`, ['alt']]]));
      state.valAnc.set(new Map([[M, 1]]));
      await svc.genBeispielXml();
      expect(state.valFehler()).toBeNull();
      expect(state.valAnc()).toBeNull();
    });
  });

  describe('Zeile→Pfad-Karte (buildBeispielXmlMitPfaden)', () => {
    it('liefert dasselbe XML wie buildBeispielXml (beide Modi)', () => {
      expect(svc.buildBeispielXmlMitPfaden()!.xml).toBe(svc.buildBeispielXml()!);
      expect(svc.buildBeispielXmlMitPfaden({ instanz: true })!.xml).toBe(
        svc.buildBeispielXml({ instanz: true })!,
      );
    });

    it('mappt Element-Zeilen auf Baumpfade; Deklaration und Praeambel bleiben ohne Eintrag', () => {
      const res = svc.buildBeispielXmlMitPfaden()!;
      const zeilen = res.xml.split('\n');
      const nr = (frag: string): number => zeilen.findIndex((l) => l.includes(frag)) + 1;
      expect(res.zeilenPfade.get(1)).toBeUndefined(); // XML-Deklaration
      expect(res.zeilenPfade.get(2)).toBeUndefined(); // Praeambel-Kommentar
      expect(res.zeilenPfade.get(nr(`<${M}`))).toBe(M);
      expect(res.zeilenPfade.get(nr('<kopf>'))).toBe(`${M}/kopf`);
      expect(res.zeilenPfade.get(nr(`</${M}>`))).toBe(M);
    });

    it('Instanz-Modus ohne Praeambel: Root-Open ist Zeile 2', () => {
      const res = svc.buildBeispielXmlMitPfaden({ instanz: true })!;
      expect(res.zeilenPfade.get(2)).toBe(M);
    });

    it('Codelisten-Blatt: alle drei Zeilen tragen den Blattpfad', () => {
      state.setElementProfile(`${M}/farbe`, { status: 's1' });
      const res = svc.buildBeispielXmlMitPfaden()!;
      const zeilen = res.xml.split('\n');
      const start = zeilen.findIndex((l) => l.includes('<farbe')) + 1;
      expect(res.zeilenPfade.get(start)).toBe(`${M}/farbe`);
      expect(res.zeilenPfade.get(start + 1)).toBe(`${M}/farbe`); // <code xmlns="">
      expect(res.zeilenPfade.get(start + 2)).toBe(`${M}/farbe`); // </farbe>
    });

    it('Auspraegungen: die Zeile traegt den Kontextpfad mit @auspId', () => {
      state.addAusp(`${M}/az`);
      const auspId = state.auspsOf(`${M}/az`)![0]!.id;
      const res = svc.buildBeispielXmlMitPfaden()!;
      const zeilen = res.xml.split('\n');
      const nr = zeilen.findIndex((l) => l.includes('<az>')) + 1;
      expect(res.zeilenPfade.get(nr)).toBe(`${M}/az@${auspId}`);
      // Der Auspraegungs-Kommentar davor bleibt ohne Eintrag.
      expect(res.zeilenPfade.get(nr - 1)).toBeUndefined();
    });
  });

  // ── Instanz-Variante (US "Testnachricht gefuehrt erstellen") ──────────

  describe('Beispiel-XML als Instanz-Zwischenstand ({instanz: true})', () => {
    const instanz = (): string => svc.buildBeispielXml({ instanz: true })!;

    it('Blaetter tragen nur erfasste Werte — leer statt Platzhalter, keine Beispiel-Kommentare', () => {
      const xml = instanz();
      expect(xml).toContain('<kopf></kopf>'); // Pflicht-Blatt ohne Wert: leer
      expect(xml).not.toContain('Beispieltext');
      expect(xml).not.toContain('Beispielnachricht');
      state.setElementProfile(`${M}/kopf`, { beispiel: 'Kopfwert' });
      expect(instanz()).toContain('<kopf>Kopfwert</kopf>');
    });

    it('eine Auswahl ohne gewaehlten Zweig bleibt offen (Kommentar statt geratenem Zweig)', () => {
      const xml = instanz();
      expect(xml).toContain('<!-- Auswahl noch offen:');
      expect(xml).not.toContain('<email>');
      expect(xml).not.toContain('<telefon>');
    });

    it('nur der explizit gewaehlte Zweig erscheint', () => {
      state.setElementProfile(`${M}/_auswahl/email`, { status: 's1', beispiel: 'a@b.de' });
      state.setElementProfile(`${M}/_auswahl/telefon`, { status: 's3', beispiel: '0301234' });
      const xml = instanz();
      expect(xml).toContain('<email>a@b.de</email>');
      expect(xml).not.toContain('<telefon>');
      expect(xml).not.toContain('Auswahl noch offen');
    });

    it('ein einzig befuellter Zweig wird serialisiert, ohne dass er gewaehlt wurde', () => {
      // ADR 0016: der Wert entscheidet — Fuehrung und Serialisierung lesen
      // dieselbe Regel (`GuidedService.gewaehlterZweig`).
      state.setElementProfile(`${M}/_auswahl/telefon`, { beispiel: '0301234' });
      const xml = instanz();
      expect(xml).toContain('<telefon>0301234</telefon>');
      expect(xml).not.toContain('<email>');
      expect(xml).not.toContain('Auswahl noch offen');

      // Zwei befuellte Zweige bleiben mehrdeutig — es wird keiner geraten.
      state.setElementProfile(`${M}/_auswahl/email`, { beispiel: 'a@b.de' });
      expect(instanz()).toContain('<!-- Auswahl noch offen:');
    });

    it('nicht aufgenommene optionale Gruppen entfallen; aufgenommene bringen ihre Pflicht-Kinder', () => {
      expect(instanz()).not.toContain('<detail>');
      state.setElementProfile(`${M}/_gruppe`, { status: 's1' });
      expect(instanz()).toContain('<detail></detail>');
    });

    it('die Standard-Variante bleibt unveraendert (Platzhalter, erster Zweig)', () => {
      const xml = svc.buildBeispielXml()!;
      expect(xml).toContain('<kopf>Beispieltext</kopf>');
      expect(xml).toContain('<email>');
    });

    it('von der gebundenen Profilfassung Ausgeschlossenes erscheint nicht in der Instanz', () => {
      // Vorgabe mit eigener Stufenliste: az und der versionskopf-Ast entfallen.
      state.setVorgabe({
        meta: {},
        statuses: [
          { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
        ],
        elemente: { [`${M}/az`]: { status: 'v9' }, [`${M}/versionskopf`]: { status: 'v9' } },
        auspraegungen: {},
        erweiterungen: {},
      });
      state.setElementProfile(`${M}/az`, { beispiel: 'darf nicht erscheinen' });

      const xml = instanz();
      expect(xml).not.toContain('<az>');
      expect(xml).not.toContain('<versionskopf');
      expect(xml).not.toContain('<titel>'); // Teilbaum entfaellt mit
      expect(xml).toContain('<kopf>');
    });

    it('die Mindestanzahl der gebundenen Fassung bringt ein optionales Element ins XML', () => {
      // Vorher las `include` die Kardinalitaet roh (eigene Schicht + Schema)
      // statt ueber `effKard`: eine Untergrenze der Profilierung blieb beim
      // Schreiben unbeachtet, der Abgleich zaehlte das Element aber als
      // vorhanden — die gespeicherte Nachricht verletzte die Vorgabe und galt
      // als konform. Seit `core/enthalten.ts` lesen beide dieselbe Regel.
      expect(instanz()).not.toContain('<az>');

      state.setVorgabe({
        meta: {},
        statuses: [],
        elemente: { [`${M}/az`]: { min: '1' } }, // eingegrenzt, ohne Statusstufe
        auspraegungen: {},
        erweiterungen: {},
      });

      expect(instanz()).toContain('<az></az>');
    });
  });

  // ── Schema-Erweiterungen (US Schema-Erweiterung) ──────────────────────

  describe('Schema-Erweiterungen', () => {
    it('Beispiel-XML enthaelt Erweiterungen immer — auch min=0 ohne Beispielwert, verschachtelt', () => {
      const id = state.addErweiterung(M, { name: 'zusatzBlock', min: '0', max: '1' });
      state.addErweiterung(`${M}/~${id}`, {
        name: 'zusatzFeld',
        min: '0',
        max: '1',
        datentyp: 'string',
      });
      const res = svc.buildBeispielXmlMitPfaden()!;
      expect(res.xml).toContain('<zusatzBlock>');
      expect(res.xml).toMatch(/<zusatzFeld>.+<\/zusatzFeld>/); // typkonformer Platzhalter
      // Die Zeile→Pfad-Karte traegt den /~-Pfad der Erweiterung.
      const zeile = res.xml.split('\n').findIndex((l) => l.includes('<zusatzBlock>')) + 1;
      expect(res.zeilenPfade.get(zeile)).toBe(`${M}/~${id}`);
    });

    it('eine typisierte Erweiterung zieht ihre Schema-Kinder nach (#97)', () => {
      state.addErweiterung(M, {
        name: 'zusatzKopf',
        min: '0',
        max: '1',
        datentyp: 'Type.Test.Kopf',
        datentypQuelle: 'schema',
      });

      const res = svc.buildBeispielXmlMitPfaden()!;

      // Der Rumpf des Typs erscheint — inklusive der fixen Pflicht-Attribute.
      expect(res.xml).toContain('<zusatzKopf xjustizVersion="3.6.2">');
      expect(res.xml).toMatch(/<titel>.+<\/titel>/);
      // Die Druckzeilen ziehen ueber denselben Walk nach.
      const rows = svc.buildPrintRows();
      expect(rows.find((x) => x.tech === 'zusatzKopf')!.erweiterung).toBeTrue();
      // Das Kind erscheint als eigene Zeile und ist echter Schemainhalt, keine
      // Nachbeauftragung.
      expect(rows.find((x) => x.tech === 'titel')!.erweiterung).toBeFalse();
    });

    it('Beispiel-XML traegt den Warnkommentar mit der aktiven Schemaversion (#98)', () => {
      state.version.set('3.6.2');
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' });
      expect(svc.buildBeispielXml()).toContain(
        '<!-- Enthält nachbeauftragte Elemente — gegen XJustiz 3.6.2 nicht gültig. -->',
      );
    });

    it('Beispiel-XML ohne Erweiterungen bleibt ohne Warnkommentar (#98)', () => {
      state.version.set('3.6.2');
      expect(svc.buildBeispielXml()).not.toContain('nachbeauftragte Elemente');
    });

    it('Schematron ist bei Erweiterungen gesperrt und meldet den Grund (#98)', () => {
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' });
      svc.exportSchematron();
      expect(downloaded.length).toBe(0);
      expect(toasts).toContain(ERW_SPERRE_GRUND);
    });

    it('Excel-Guard und Druck bleiben trotz Erweiterungen frei (#98)', () => {
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' });
      expect(svc.bestaetigeOffeneEntscheidungen()).toBeTrue();
      expect(svc.buildPrintRows().length).toBeGreaterThan(0);
    });

    it('buildPrintRows kennzeichnet Erweiterungs-Zeilen', () => {
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' });
      const rows = svc.buildPrintRows();
      expect(rows.find((x) => x.tech === 'zusatzAngabe')!.erweiterung).toBeTrue();
      expect(rows.find((x) => x.tech === 'kopf')!.erweiterung).toBeFalse();
    });

    it('genBeispielXml exportiert trotz invalide, wenn nur Erweiterungs-Fehler vorliegen', async () => {
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' });
      const res = svc.buildBeispielXmlMitPfaden()!;
      const zeile = res.xml.split('\n').findIndex((l) => l.includes('<zusatzAngabe>')) + 1;
      pruefung = {
        status: 'invalide',
        fehler: ['nicht erwartet'],
        fehlerDetails: [{ text: "Element 'zusatzAngabe': This element is not expected.", zeile }],
      };
      await svc.genBeispielXml();
      expect(downloaded.length).toBe(1);
      expect(TestBed.inject(ValidationReportService).offen()).toBeFalse();
      // Keine roten Baum-Marker fuer erwartete Abweichungen.
      expect(state.valFehler()).toBeNull();
    });

    it('genBeispielXml blockiert weiterhin bei gemischten Fehlern — mit Kennzeichnung', async () => {
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' });
      const res = svc.buildBeispielXmlMitPfaden()!;
      const zeilen = res.xml.split('\n');
      const zErw = zeilen.findIndex((l) => l.includes('<zusatzAngabe>')) + 1;
      const zKopf = zeilen.findIndex((l) => l.includes('<kopf>')) + 1;
      pruefung = {
        status: 'invalide',
        fehler: ['erw', 'echt'],
        fehlerDetails: [
          { text: "Element 'zusatzAngabe': This element is not expected.", zeile: zErw },
          { text: 'Zeile: kopf falsch belegt', zeile: zKopf },
        ],
      };
      await svc.genBeispielXml();
      expect(downloaded.length).toBe(0);
      const report = TestBed.inject(ValidationReportService);
      expect(report.offen()).toBeTrue();
      expect(report.eintraege()[0]!.erweiterung).toBeTrue();
      expect(report.eintraege()[1]!.erweiterung).toBeUndefined();
      // Nur der echte Fehler markiert den Baum.
      expect(state.valFehler()?.has(`${M}/kopf`)).toBeTrue();
      expect([...state.valFehler()!.keys()].some((p) => p.includes('/~'))).toBeFalse();
    });
  });
});
