import { TestBed } from '@angular/core/testing';
import { ExportService } from './export.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { XsdParserService } from './xsd-parser.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';
import { XsdDoc } from '../../models/xsd-index.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
    <xs:choice>
      <xs:element name="email" type="xs:string"/>
      <xs:element name="telefon" type="xs:string"/>
    </xs:choice>
    <xs:sequence minOccurs="0">
      <xs:element name="detail" type="xs:string"/>
    </xs:sequence>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0001';

describe('ExportService (Schematron)', () => {
  let svc: ExportService;
  let state: StateService;
  let downloaded: { name: string; content: string }[];

  beforeEach(() => {
    downloaded = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DownloadService,
          useValue: {
            download: (name: string, content: string) => downloaded.push({ name, content }),
            profilFilename: (ext: string) => 'test.' + ext,
          },
        },
        { provide: ToastService, useValue: { show: () => {} } },
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
    expect(sch().indexOf('Festlegung zu "az"')).toBeLessThan(sch().indexOf('<sch:assert test="xj:az">'));
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
    const kommentar = sch().split('\n').find((l) => l.includes('Festlegung zu "az"'))!;
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

    it('liefert null ohne geladene Nachricht', () => {
      state.root.set(null);
      expect(svc.buildBeispielXml()).toBeNull();
    });

    it('genBeispielXml laedt denselben Inhalt herunter (Regression fuer den Split)', () => {
      const xml = svc.buildBeispielXml()!;
      svc.genBeispielXml();
      expect(downloaded.length).toBe(1);
      expect(downloaded[0]!.content).toBe(xml);
      expect(downloaded[0]!.name).toBe('test.beispiel.xml');
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
  });
});
