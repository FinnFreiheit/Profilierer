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
        <xs:element name="varianteA" type="Type.Test.VarA"/>
        <xs:element name="varianteB" type="xs:string"/>
        <xs:sequence><xs:element name="paarPflicht" type="xs:string"/></xs:sequence>
      </xs:choice>
      <xs:element name="auswahlContainer" type="Type.Test.Auswahl" minOccurs="0"/>
      <xs:element name="optionaleAuswahl" type="Type.Test.OptAuswahl" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <!-- Inhaltsmodell ist die Auswahl selbst (XJustiz-Form auswahl_*). -->
  <xs:complexType name="Type.Test.Auswahl">
    <xs:choice>
      <xs:element name="email" type="xs:string"/>
      <xs:element name="telefon" type="xs:string"/>
    </xs:choice>
  </xs:complexType>
  <!-- Auswahl als optionale Gruppe: verlangt nichts. -->
  <xs:complexType name="Type.Test.OptAuswahl">
    <xs:sequence>
      <xs:choice minOccurs="0">
        <xs:element name="x" type="xs:string"/>
        <xs:element name="y" type="xs:string"/>
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
  <xs:complexType name="Type.Test.VarA">
    <xs:sequence>
      <xs:element name="varPflicht" type="xs:string"/>
      <xs:element name="varOptional" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;

/**
 * Schema fuer typisierte Schema-Erweiterungen (#97): ein fachlicher Typ mit
 * Unterelementen, ein Codelisten-Typ und ein Typ, der eine Rekursion ueber die
 * Erweiterungsgrenze hinweg erlaubt.
 */
const XSD_ERW = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="akte" type="Type.Test.Akte"/>
      <xs:element name="datum" type="xs:date"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Akte">
    <xs:sequence>
      <xs:element name="identifikation" type="xs:string">
        <xs:annotation><xs:documentation>Aktenzeichen der Beiakte</xs:documentation></xs:annotation>
      </xs:element>
      <xs:element name="laufzeit" type="Type.Test.Laufzeit" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Laufzeit">
    <xs:sequence><xs:element name="beginn" type="xs:date"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Code.Test.Aktentyp">
    <xs:annotation>
      <xs:appinfo>
        <codeliste><nameLang>Aktentyp</nameLang><kennung>test:aktentyp</kennung></codeliste>
      </xs:appinfo>
    </xs:annotation>
    <xs:sequence>
      <xs:element name="code" type="test.aktentyp"/>
      <xs:element name="name" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:simpleType name="test.aktentyp">
    <xs:restriction base="xs:token"><xs:enumeration value="001"/></xs:restriction>
  </xs:simpleType>
</xs:schema>`;

/** Schema fuer die Typ-Wurzel: Struktur, Codeliste, Rekursion, simpleType. */
const XSD_TYP = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence><xs:element name="hersteller" type="Type.Test.Herstellerinformation"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Herstellerinformation">
    <xs:annotation><xs:documentation>Angaben zum Hersteller.</xs:documentation></xs:annotation>
    <xs:sequence>
      <xs:element name="produktname" type="xs:string"/>
      <xs:element name="hersteller" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <!-- Traegt sich selbst: der Rekursionsschutz muss ab der Wurzel greifen. -->
  <xs:complexType name="Type.Test.Ordner">
    <xs:sequence>
      <xs:element name="name" type="xs:string"/>
      <xs:element name="unterordner" type="Type.Test.Ordner" minOccurs="0" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Code.Test.Aktentyp">
    <xs:annotation>
      <xs:appinfo>
        <codeliste><nameLang>Aktentyp</nameLang><kennung>test:aktentyp</kennung></codeliste>
      </xs:appinfo>
    </xs:annotation>
    <xs:sequence><xs:element name="code" type="test.aktentyp"/></xs:sequence>
  </xs:complexType>
  <xs:simpleType name="test.aktentyp">
    <xs:restriction base="xs:token"><xs:enumeration value="001"/></xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="Type.Test.Aktenzeichen">
    <xs:restriction base="xs:string"/>
  </xs:simpleType>
</xs:schema>`;

describe('TreeService — buildTypRoot (Datentyp als Baumwurzel)', () => {
  let tree: TreeService;
  let idx: XsdIndex;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    tree = TestBed.inject(TreeService);
    const dom = new DOMParser().parseFromString(XSD_TYP, 'application/xml');
    idx = TestBed.inject(XsdParserService).buildIndexFrom([{ file: 'typ.xsd', dom }]).idx;
  });

  it('baut aus einem complexType eine Wurzel mit Kindern', () => {
    const root = tree.buildTypRoot('Type.Test.Herstellerinformation', idx);
    expect(root.path).toBe('Type.Test.Herstellerinformation');
    expect(root.typeName).toBe('Type.Test.Herstellerinformation');
    expect(root.xsdEl).toBeNull();
    expect(root.doc).toBe('Angaben zum Hersteller.');
    expect(tree.isLeaf(root)).toBeFalse();
    expect(tree.kinder(root).map((k) => k.name)).toEqual(['produktname', 'hersteller']);
    expect(tree.kinder(root)[0]!.path).toBe('Type.Test.Herstellerinformation/produktname');
  });

  it('macht aus einem Code.*-Typ ein Blatt mit Codelisten-Info', () => {
    const root = tree.buildTypRoot('Code.Test.Aktentyp', idx);
    expect(root.codelist?.kennung).toBe('test:aktentyp');
    expect(tree.isLeaf(root)).toBeTrue();
    expect(tree.kinder(root)).toEqual([]);
  });

  it('erkennt Rekursion schon eine Ebene unter der Wurzel', () => {
    const root = tree.buildTypRoot('Type.Test.Ordner', idx);
    const unter = tree.kinder(root).find((k) => k.name === 'unterordner')!;
    expect(unter.recursive).toBeTrue();
    expect(tree.childItems({ kind: 'el', node: unter })).toEqual([]);
  });

  it('macht aus einem simpleType ein Blatt', () => {
    const root = tree.buildTypRoot('Type.Test.Aktenzeichen', idx);
    expect(tree.isLeaf(root)).toBeTrue();
    expect(tree.kinder(root)).toEqual([]);
  });
});

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

  describe('collectMandatoryPaths ab Teilbaum-Anker', () => {
    let mandIdx: XsdIndex;

    beforeEach(() => {
      const parser = TestBed.inject(XsdParserService);
      const dom = new DOMParser().parseFromString(XSD_MAND, 'application/xml');
      mandIdx = parser.buildIndexFrom([{ file: 'xjustiz_0000_mand.xsd', dom }]).idx;
    });

    it('sammelt ab einem Anker mitten im Baum (optionaler Zwischenelternteil)', () => {
      const root = tree.buildRoot('nachricht.test.0001', mandIdx);
      const anker = tree.kinder(root).find((k) => k.name === 'optionalBlock')!;

      const paths = tree.collectMandatoryPaths(anker);

      // Unterhalb des Ankers zaehlt das lokale Pflicht-Rueckgrat — der
      // (optionale) Anker selbst ist nicht enthalten.
      expect(paths).toEqual(['nachricht.test.0001/optionalBlock/pflichtImOptional']);
    });

    it('sammelt ab einem Auspraegungs-Kontextknoten im Pfadraum @auspId', () => {
      const root = tree.buildRoot('nachricht.test.0001', mandIdx);
      const bet = tree.kinder(root).find((k) => k.name === 'beteiligter')!;
      const auspId = state.addAusp(bet.path, 'Notar');
      const anker = tree.ctxNode(bet, auspId);

      const paths = tree.collectMandatoryPaths(anker);

      // Pflichtkind im Auspraegungs-Pfadraum; optionale Kinder bleiben aussen vor.
      expect(paths).toEqual(['nachricht.test.0001/beteiligter@' + auspId + '/name']);
    });

    it('sammelt ab einem Anker auf einem Auswahl-Zweig dessen lokales Rueckgrat', () => {
      const root = tree.buildRoot('nachricht.test.0001', mandIdx);
      const auswahl = tree.kinder(root).find((k) => k.name === '(Auswahl)')!;
      const anker = tree.kinder(auswahl).find((k) => k.name === 'varianteA')!;
      expect(anker.inChoice).toBeTrue();

      const paths = tree.collectMandatoryPaths(anker);

      // Der Zweig selbst ist frei gewaehlt — unterhalb zaehlt sein Pflicht-Rueckgrat.
      expect(paths).toEqual(['nachricht.test.0001/_auswahl/varianteA/varPflicht']);
    });

    it('laesst beim Anker auf der Auswahl selbst alle Alternativen frei — auch Gruppen', () => {
      const root = tree.buildRoot('nachricht.test.0001', mandIdx);
      const anker = tree.kinder(root).find((k) => k.name === '(Auswahl)')!;

      // Element- wie Sequenz-Alternativen sind gleichermassen frei waehlbar —
      // keine davon gehoert zum unbedingten Rueckgrat.
      expect(tree.collectMandatoryPaths(anker)).toEqual([]);
    });
  });

  describe('verlangtAuswahl (#71): die Auswahl erzwingt einen Zweig', () => {
    let mandIdx: XsdIndex;

    beforeEach(() => {
      const parser = TestBed.inject(XsdParserService);
      const dom = new DOMParser().parseFromString(XSD_MAND, 'application/xml');
      mandIdx = parser.buildIndexFrom([{ file: 'xjustiz_0000_mand.xsd', dom }]).idx;
    });

    it('erkennt den Container, dessen Inhaltsmodell die Auswahl ist', () => {
      const root = tree.buildRoot('nachricht.test.0001', mandIdx);
      const anker = tree.kinder(root).find((k) => k.name === 'auswahlContainer')!;

      // Kein Pflicht-Rueckgrat — und trotzdem kein Mangel: einer der beiden
      // Zweige muss belegt werden, welcher ist Sache des Durchlaufs.
      expect(tree.collectMandatoryPaths(anker)).toEqual([]);
      expect(tree.verlangtAuswahl(anker)).toBeTrue();
    });

    it('erkennt die unbedingte Auswahl-Gruppe innerhalb einer Sequenz', () => {
      const root = tree.buildRoot('nachricht.test.0001', mandIdx);

      expect(tree.verlangtAuswahl(root)).toBeTrue();
    });

    it('eine optionale Auswahl-Gruppe verlangt nichts', () => {
      const root = tree.buildRoot('nachricht.test.0001', mandIdx);
      const anker = tree.kinder(root).find((k) => k.name === 'optionaleAuswahl')!;

      expect(tree.verlangtAuswahl(anker)).toBeFalse();
    });

    it('ein Container ohne Auswahl bleibt unberuehrt', () => {
      const root = tree.buildRoot('nachricht.test.0001', mandIdx);
      const anker = tree.kinder(root).find((k) => k.name === 'beteiligter')!;

      expect(tree.verlangtAuswahl(anker)).toBeFalse();
    });
  });

  describe('walkProfil / abstiegsKinder (die Ersetzungsregel, einmal)', () => {
    const M = 'nachricht.test.0001';

    it('vorkommenKinder: benannte Vorkommen ersetzen die generischen Kinder', () => {
      const root = tree.buildRoot(M, idx);
      state.root.set(root);
      const bet = (
        tree.childItems({ kind: 'el', node: root })[0] as Extract<TreeItem, { kind: 'el' }>
      ).node;

      expect(tree.vorkommenKinder(bet)).toBeNull(); // ohne Vorkommen: generischer Abstieg
      const id = state.addAusp(bet.path, 'Notar/in');
      const vorkommen = tree.vorkommenKinder(bet)!;
      expect(vorkommen.length).toBe(1);
      expect(vorkommen[0]!.node.path).toBe(`${M}/beteiligung@${id}`);
      expect(vorkommen[0]!.ausp.name).toBe('Notar/in');
      // abstiegsKinder traegt dieselbe Regel plus den generischen Fall.
      expect(tree.abstiegsKinder(bet).map((k) => k.ausp?.name)).toEqual(['Notar/in']);
    });

    it('walkProfil betritt Vorkommen-Kontexte statt der generischen Kinder', () => {
      const root = tree.buildRoot(M, idx);
      state.root.set(root);
      const bet = (
        tree.childItems({ kind: 'el', node: root })[0] as Extract<TreeItem, { kind: 'el' }>
      ).node;
      const id = state.addAusp(bet.path, 'Notar/in');

      const besucht: string[] = [];
      tree.walkProfil(root, ({ node }) => {
        besucht.push(node.path);
        return true;
      });

      // Der gerenderte Pfadraum (@id) wird betreten, der generische nicht —
      // genau die Regel, deren Nachbau in Bug #28 Teil 1 fehlte.
      expect(besucht).toContain(`${M}/beteiligung@${id}`);
      expect(besucht).toContain(`${M}/beteiligung@${id}/name`);
      expect(besucht).not.toContain(`${M}/beteiligung/name`);
    });

    it('walkProfil: eine Mutation im Besuch wirkt auf den anschliessenden Abstieg', () => {
      // Das Muster der Materialisierung: addAusp im Besuch, danach muss der
      // Walk die frisch entstandenen Vorkommen betreten.
      const root = tree.buildRoot(M, idx);
      state.root.set(root);

      const besucht: string[] = [];
      tree.walkProfil(root, ({ node, ausp }) => {
        besucht.push(node.path);
        if (node.name === 'beteiligung' && !ausp && !state.auspsOf(node.path)?.length) {
          state.addAusp(node.path, 'Vorkommen 1');
          state.addAusp(node.path, 'Vorkommen 2');
        }
        return true;
      });

      expect(besucht.filter((p) => p.includes('@')).length).toBe(4); // 2 Kontexte + je 1 name
    });

    it('collectMandatoryPaths sammelt das Rueckgrat je Vorkommen an den @-Pfaden', () => {
      // Die Asymmetrie vor dem Umbau: der Walk lief nur ueber generische
      // Kinder, die Vorbelegung landete an Pfaden, die bei benannten Vorkommen
      // niemand rendert. Massgeblich ist ein PFLICHT-Element mit Vorkommen —
      // Optionales ueberspringt das Rueckgrat weiterhin (siehe unten).
      const parser = TestBed.inject(XsdParserService);
      const dom = new DOMParser().parseFromString(XSD_MAND, 'application/xml');
      const mandIdx = parser.buildIndexFrom([{ file: 'xjustiz_0000_mand.xsd', dom }]).idx;
      const root = tree.buildRoot(M, mandIdx);
      state.root.set(root);
      const id = state.addAusp(`${M}/beteiligter`, 'Notar/in');

      const pfade = tree.collectMandatoryPaths(root);
      expect(pfade).toContain(`${M}/beteiligter`);
      expect(pfade).toContain(`${M}/beteiligter@${id}/name`);
      expect(pfade).not.toContain(`${M}/beteiligter/name`);
    });

    it('collectMandatoryPaths ueberspringt Optionales auch mit Vorkommen', () => {
      // Semantik unveraendert: das Rueckgrat ist unbedingt — ein optionales
      // Element betritt es nicht, Vorkommen hin oder her (deren Vorbelegung
      // uebernimmt die Kompensations-Schleife in pflichtVorbelegen).
      const root = tree.buildRoot(M, idx);
      state.root.set(root);
      const bet = (
        tree.childItems({ kind: 'el', node: root })[0] as Extract<TreeItem, { kind: 'el' }>
      ).node;
      const id = state.addAusp(bet.path, 'Notar/in');

      const pfade = tree.collectMandatoryPaths(root);
      expect(pfade).not.toContain(`${M}/beteiligung@${id}/name`);
      expect(pfade).toContain(`${M}/datum`);
    });
  });

  describe('walkProfil: Waechter (Deep-Review)', () => {
    it('rekursive Elemente werden nicht abgestiegen, auch nicht ueber Vorkommen', () => {
      // Alle Alt-Walker stoppten an `recursive`, bevor sie die Ersetzungsregel
      // pruefen — ctxNode traegt nie `recursive`, der Abstieg liefe sonst bis
      // zur Tiefenkappe und legte persistente Zustaende an.
      const root = tree.buildRoot('nachricht.test.0001', idx);
      state.root.set(root);
      const bet = (
        tree.childItems({ kind: 'el', node: root })[0] as Extract<TreeItem, { kind: 'el' }>
      ).node;
      state.addAusp(bet.path, 'Notar/in');
      bet.recursive = true; // rekursiver Typ, nachtraeglich markiert

      expect(tree.abstiegsKinder(bet)).toEqual([]);
      const besucht: string[] = [];
      tree.walkProfil(root, ({ node }) => {
        besucht.push(node.path);
        return true;
      });
      expect(besucht.some((p) => p.includes('@'))).toBeFalse();
      // Die Darstellung zeigt die Vorkommen weiterhin (bewusste alte Asymmetrie).
      expect(tree.childItems({ kind: 'el', node: bet }).length).toBe(1);
    });

    it('ein Vorkommen-Schritt verbraucht keine Tiefe', () => {
      // Alt-Walker sprangen mit derselben Tiefe in den Kontext: Kinder eines
      // Vorkommens liegen so tief wie generische Kinder.
      const root = tree.buildRoot('nachricht.test.0001', idx);
      state.root.set(root);
      const bet = (
        tree.childItems({ kind: 'el', node: root })[0] as Extract<TreeItem, { kind: 'el' }>
      ).node;
      state.addAusp(bet.path, 'Notar/in');

      const tiefen = new Map<string, number>();
      tree.walkProfil(root, (schritt, tiefe) => {
        tiefen.set(schritt.node.path, tiefe);
        return true;
      });
      const auspPfad = [...tiefen.keys()].find((p) => p.endsWith('name') && p.includes('@'))!;
      // beteiligung liegt auf Tiefe 0, ihr Vorkommen-Kind name auf Tiefe 1 —
      // wie das generische Geschwister datum.
      expect(tiefen.get(auspPfad)).toBe(1);
      expect(tiefen.get('nachricht.test.0001/datum')).toBe(0);
    });
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

  describe('Erweiterung mit komplexem Datentyp (#97)', () => {
    const M = 'nachricht.test.0001';
    let erwIdx: XsdIndex;

    beforeEach(() => {
      const parser = TestBed.inject(XsdParserService);
      const dom = new DOMParser().parseFromString(XSD_ERW, 'application/xml');
      erwIdx = parser.buildIndexFrom([{ file: 'xjustiz_0000_erw.xsd', dom }]).idx;
    });

    /** Legt eine Erweiterung an und liefert ihren Knoten im frisch gebauten Baum. */
    function erwKnoten(elternPfad: string, daten: Parameters<StateService['addErweiterung']>[1]) {
      const id = state.addErweiterung(elternPfad, daten);
      return { id, pfad: elternPfad + '/~' + id };
    }

    it('loest die Unterelemente eines Schema-Typs auf', () => {
      const root = tree.buildRoot(M, erwIdx);
      const { pfad } = erwKnoten(root.path, {
        name: 'beiakte',
        min: '0',
        max: '1',
        datentyp: 'Type.Test.Akte',
        datentypQuelle: 'schema',
      });

      const erw = tree.kinder(root).find((k) => k.path === pfad)!;
      expect(tree.isLeaf(erw)).toBeFalse();
      expect(tree.itemHasKids({ kind: 'el', node: erw })).toBeTrue();
      const kinder = tree.kinder(erw);
      expect(kinder.map((k) => k.name)).toEqual(['identifikation', 'laufzeit']);
      // Kinder tragen Doku und Kardinalitaet aus dem Schema und liegen im
      // Pfadraum der Erweiterung.
      expect(kinder[0]!.path).toBe(pfad + '/identifikation');
      expect(kinder[0]!.doc).toBe('Aktenzeichen der Beiakte');
      expect(kinder[1]!.min).toBe('0');
    });

    it('ein Codelisten-Typ macht die Erweiterung zum Blatt mit Werteauswahl', () => {
      const root = tree.buildRoot(M, erwIdx);
      const { pfad } = erwKnoten(root.path, {
        name: 'aktentyp',
        min: '1',
        max: '1',
        datentyp: 'Code.Test.Aktentyp',
        datentypQuelle: 'schema',
      });

      const erw = tree.kinder(root).find((k) => k.path === pfad)!;
      expect(erw.codelist?.kennung).toBe('test:aktentyp');
      expect(erw.codelist?.werte?.map((w) => w.value)).toEqual(['001']);
      // Der complexType-Rumpf (code/name) wird nicht ausgeklappt — wie bei
      // Schemaknoten.
      expect(tree.isLeaf(erw)).toBeTrue();
      expect(tree.kinder(erw)).toEqual([]);
      expect(tree.itemHasKids({ kind: 'el', node: erw })).toBeFalse();
    });

    it('der Rekursionsschutz greift ueber die Erweiterungsgrenze hinweg', () => {
      const root = tree.buildRoot(M, erwIdx);
      const akte = tree.kinder(root).find((k) => k.name === 'akte')!;
      const { pfad } = erwKnoten(akte.path, {
        name: 'beiakte',
        min: '0',
        max: 'unbounded',
        datentyp: 'Type.Test.Akte',
        datentypQuelle: 'schema',
      });

      const erw = tree.kinder(akte).find((k) => k.path === pfad)!;
      expect(erw.recursive).toBeTrue();
      // Der gerenderte Baum steigt nicht ab (wie bei rekursiven Schemaknoten).
      expect(tree.childItems({ kind: 'el', node: erw })).toEqual([]);
      expect(tree.abstiegsKinder(erw)).toEqual([]);
    });

    it('ein im Schema fehlender Typ macht den Knoten zum Blatt und wird gemeldet', () => {
      const root = tree.buildRoot(M, erwIdx);
      const { pfad } = erwKnoten(root.path, {
        name: 'geheimhaltung',
        min: '0',
        max: '1',
        datentyp: 'Type.Test.Entfallen',
        datentypQuelle: 'schema',
      });
      // Profilierung unterhalb der Erweiterung — sie bleibt unangetastet.
      state.setElementProfile(pfad + '/stufe', { anmerkung: 'bleibt' });

      const erw = tree.kinder(root).find((k) => k.path === pfad)!;
      expect(tree.erwTypFehlt(erw)).toBe('Type.Test.Entfallen');
      expect(tree.isLeaf(erw)).toBeTrue();
      expect(state.elemente()[pfad + '/stufe']?.anmerkung).toBe('bleibt');
    });

    it('ein Freitext-Typ bleibt neutral — keine Fehlt-Meldung', () => {
      const root = tree.buildRoot(M, erwIdx);
      const { pfad } = erwKnoten(root.path, {
        name: 'wunschfeld',
        min: '0',
        max: '1',
        datentyp: 'Type.Test.Entfallen',
        datentypQuelle: 'frei',
      });

      const erw = tree.kinder(root).find((k) => k.path === pfad)!;
      expect(tree.erwTypFehlt(erw)).toBeNull();
      expect(tree.isLeaf(erw)).toBeTrue();
    });

    it('typisierte Erweiterung traegt eigene Erweiterungen hinter den Schema-Kindern', () => {
      const root = tree.buildRoot(M, erwIdx);
      const aussen = erwKnoten(root.path, {
        name: 'beiakte',
        min: '0',
        max: '1',
        datentyp: 'Type.Test.Akte',
        datentypQuelle: 'schema',
      });
      erwKnoten(aussen.pfad, { name: 'vermerk', min: '0', max: '1', datentyp: 'string' });
      // …und unter einem Schema-Kind der Erweiterung.
      const innen = erwKnoten(aussen.pfad + '/identifikation', {
        name: 'praefix',
        min: '0',
        max: '1',
        datentyp: 'string',
      });

      const erw = tree.kinder(root).find((k) => k.path === aussen.pfad)!;
      expect(tree.kinder(erw).map((k) => k.name)).toEqual([
        'identifikation',
        'laufzeit',
        'vermerk',
      ]);
      const ident = tree.kinder(erw)[0]!;
      expect(tree.kinder(ident).map((k) => k.path)).toEqual([innen.pfad]);
      expect(tree.itemHasKids({ kind: 'el', node: ident })).toBeTrue();
    });
  });
});
