import { TestBed } from '@angular/core/testing';
import { GuidedService } from './guided.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';
import { ElementProfile, Erweiterung } from '../../models/profile.model';
import { itemPath } from '../../models/node.model';

/**
 * Fixture: Pflicht-Rueckgrat (kopf), optionales Blatt (az), choice mit zwei
 * Zweigen, wiederholbares Element (beteiligung) und optionale sequence-Gruppe
 * mit Pflicht-Kind (detail).
 */
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
    <xs:element name="beteiligung" type="Type.Test.Bet" minOccurs="0" maxOccurs="unbounded"/>
    <xs:sequence minOccurs="0">
      <xs:element name="detail" type="xs:string"/>
    </xs:sequence>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Bet"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0001';

/**
 * Zweite Fixture nur fuer den Vorkommen-Fall: wiederholbares `beteiligung` mit
 * einem **schema-optionalen** Blatt `rolle`, dazu ein wiederholbares `anlage`
 * mit beidseitig begrenzter Schema-Kardinalitaet (2..3) fuer die
 * Kardinalitaets-Sperren. Eigenes Schema, damit die Punkt-Zaehlungen der
 * Haupt-Fixture unberuehrt bleiben.
 */
const XSD_VORKOMMEN = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0002" type="Type.Test2.Root"/>
  <xs:complexType name="Type.Test2.Root"><xs:sequence>
    <xs:element name="beteiligung" type="Type.Test2.Bet" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="anlage" type="xs:string" minOccurs="2" maxOccurs="3"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test2.Bet"><xs:sequence>
    <xs:element name="rolle" type="xs:string" minOccurs="0"/>
    <xs:element name="kontakt" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M2 = 'nachricht.test.0002';

/**
 * Dritte Fixture fuer die Verweise (Issue #30): ein wiederholbares
 * `beteiligung` mit dem Nummern-Blatt `rollennummer` und ein Verweis-Traeger
 * `verweis` vom Typ `Type.GDS.Ref.Rollennummer`, unter dem allein das
 * Nummern-Blatt `ref.rollennummer` liegt — genau der Aufbau des
 * Grunddatensatzes.
 */
const XSD_VERWEIS = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0003" type="Type.Test3.Root"/>
  <xs:complexType name="Type.Test3.Root"><xs:sequence>
    <xs:element name="beteiligung" type="Type.Test3.Bet" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="anlage" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="verweis" type="Type.GDS.Ref.Rollennummer"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test3.Bet"><xs:sequence>
    <xs:element name="rollennummer" type="xs:string" minOccurs="0"/>
    <xs:element name="name" type="xs:string" minOccurs="0"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.GDS.Ref.Rollennummer"><xs:sequence>
    <xs:element name="ref.rollennummer" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M3 = 'nachricht.test.0003';

/**
 * Vierte Fixture fuer die Typpruefung am **freien** Feld: ein optionales
 * `datum` (xs:date). Leer ist dort eine gueltige Antwort, ein eingetragener
 * Wert muss aber zum Datentyp passen (ADR 0016).
 */
const XSD_TYP = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0004" type="Type.Test4.Root"/>
  <xs:complexType name="Type.Test4.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date" minOccurs="0"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M4 = 'nachricht.test.0004';

describe('GuidedService', () => {
  let svc: GuidedService;
  let state: StateService;

  /** id der Default-Stufe je Wirkung (s1 pflicht, s2 optional, s3 ausgeschlossen, s4 markierung). */
  const S = { pflicht: 's1', optional: 's2', excl: 's3', markierung: 's4' };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(GuidedService);
    state = TestBed.inject(StateService);
    const tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    const idx = parser.buildIndexFrom(docs).idx;
    state.idx.set(idx);
    state.root.set(tree.buildRoot(M, idx));
  });

  const pfade = (): string[] => svc.punkte().map((p) => p.path);

  /** Schaltet die Testbasis auf die Vorkommen-Fixture (M2) um. */
  const ladeVorkommenFixture = (): void => {
    const tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD_VORKOMMEN, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test2.xsd', dom }]).idx;
    state.idx.set(idx);
    state.root.set(tree.buildRoot(M2, idx));
  };

  /** Schaltet die Testbasis auf die Typ-Fixture (M4) um. */
  const ladeTypFixture = (): void => {
    const tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD_TYP, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test4.xsd', dom }]).idx;
    state.idx.set(idx);
    state.root.set(tree.buildRoot(M4, idx));
  };

  /** Schaltet die Testbasis auf die Verweis-Fixture (M3) um. */
  const ladeVerweisFixture = (): void => {
    const tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD_VERWEIS, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test3.xsd', dom }]).idx;
    state.idx.set(idx);
    state.root.set(tree.buildRoot(M3, idx));
  };

  // ── Verweise: Ziel-Vorkommen statt Nummer (Issue #30) ─────────────────

  describe('Verweise', () => {
    beforeEach(() => {
      ladeVerweisFixture();
      state.messageCreate.set({ msgName: M3, entryId: null, name: null });
    });

    it('bietet die Ziel-Vorkommen an, unterscheidbar nach Nummer', () => {
      state.addAusp(`${M3}/beteiligung`, 'Notar/in');
      state.addAusp(`${M3}/beteiligung`, 'Notar/in');
      // Artfremdes Vorkommen: `Rollennummer` zielt laut REF_TARGETS nur auf
      // `beteiligung`.
      state.addAusp(`${M3}/anlage`, 'Schriftsatz');

      const ziele = svc.verweisZiele(`${M3}/verweis`);
      expect(ziele.length).toBe(2);
      expect(ziele[0]!.label).toContain('Vorkommen 1');
      expect(ziele[1]!.label).toContain('Vorkommen 2');

      // Auch am Nummern-Blatt, wo der gefuehrte Punkt liegt: die Art kommt vom
      // Traeger. Ohne diese Aufloesung waere sie „rollennummer", stuende nicht in
      // REF_TARGETS — und die Anlage laege mit in der Auswahl.
      const amBlatt = svc.verweisZiele(`${M3}/verweis/ref.rollennummer`);
      expect(amBlatt.map((z) => z.path)).toEqual(ziele.map((z) => z.path));
    });

    it('vergibt mit der Zielwahl die Nummer an beiden Enden', () => {
      const id1 = state.addAusp(`${M3}/beteiligung`, 'Notar/in');
      state.addAusp(`${M3}/beteiligung`, 'Zeuge/Zeugin');

      svc.waehleVerweisZiel(`${M3}/verweis`, `${M3}/beteiligung@${id1}`);

      expect(state.refZielOf(`${M3}/verweis`)).toBe(`${M3}/beteiligung@${id1}`);
      expect(state.elemente()[`${M3}/verweis/ref.rollennummer`]?.beispiel).toBe('1');
      expect(state.elemente()[`${M3}/beteiligung@${id1}/rollennummer`]?.beispiel).toBe('1');
    });

    it('loest ein eindeutiges Ziel ohne Zutun auf, mehrdeutige nicht', () => {
      const id1 = state.addAusp(`${M3}/beteiligung`, 'Notar/in');

      expect(svc.loeseEindeutigeVerweise()).toBe(1);
      expect(state.refZielOf(`${M3}/verweis`)).toBe(`${M3}/beteiligung@${id1}`);
      expect(svc.offeneSet().has(`${M3}/verweis/ref.rollennummer`)).toBeFalse();

      // Zweites Vorkommen: der naechste Lauf laesst die getroffene Wahl stehen.
      state.addAusp(`${M3}/beteiligung`, 'Zeuge/Zeugin');
      expect(svc.loeseEindeutigeVerweise()).toBe(0);
      expect(state.refZielOf(`${M3}/verweis`)).toBe(`${M3}/beteiligung@${id1}`);
    });

    it('grenzt die Auswahl auf das von der Profilierung festgelegte Ziel ein', () => {
      // Die gebundene Fassung fuehrt zwei Auspraegungen und legt fest, dass der
      // Verweis auf die erste zielt: waehlbar sind nur deren Vorkommen.
      state.setVorgabe({
        meta: {},
        statuses: [{ id: 'w1', name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' }],
        elemente: { [`${M3}/verweis`]: { refZiel: `${M3}/beteiligung@n1` } },
        auspraegungen: {
          [`${M3}/beteiligung`]: [
            { id: 'n1', name: 'Notar/in' },
            { id: 'n2', name: 'Zeuge/Zeugin' },
          ],
        },
        erweiterungen: {},
      });

      expect(svc.verweisZiele(`${M3}/verweis`).map((z) => z.path)).toEqual([
        `${M3}/beteiligung@n1`,
      ]);

      // Eine Kopie desselben Vorkommens bleibt zulaessig — sie ist dieselbe
      // Auspraegung (#28: `vonId`).
      state.copyAusp(`${M3}/beteiligung`, 'n1');
      expect(svc.verweisZiele(`${M3}/verweis`).length).toBe(2);
      // Das fremde Vorkommen bleibt draussen.
      expect(svc.verweisZiele(`${M3}/verweis`).some((z) => z.path.endsWith('@n2'))).toBeFalse();
    });
  });

  describe('Decision-Points', () => {
    it('findet genau die echten Entscheidungen in Dokumentreihenfolge', () => {
      expect(pfade()).toEqual([
        `${M}/az`,
        `${M}/_auswahl`,
        `${M}/_auswahl/email`,
        `${M}/_auswahl/telefon`,
        `${M}/beteiligung`,
        `${M}/_gruppe`,
      ]);
    });

    it('enthaelt kein Pflicht-Rueckgrat und keine erzwungenen Gruppen-Kinder', () => {
      const p = pfade();
      expect(p).not.toContain(`${M}/kopf`);
      expect(p).not.toContain(`${M}/beteiligung/name`);
      expect(p).not.toContain(`${M}/_gruppe/detail`);
    });

    it('markiert Punkt-Arten korrekt', () => {
      const arten = Object.fromEntries(svc.punkte().map((p) => [p.path, p.art]));
      expect(arten[`${M}/_auswahl`]).toBe('auswahl');
      expect(arten[`${M}/az`]).toBe('element');
      expect(arten[`${M}/_gruppe`]).toBe('element');
    });
  });

  describe('istEntschieden / Fortschritt', () => {
    it('startet mit 0 von Y; Disposition erhoeht X', () => {
      expect(svc.fortschritt()).toEqual({ x: 0, y: 6, zuKlaeren: 0 });
      state.setElementProfile(`${M}/az`, { status: S.optional });
      expect(svc.fortschritt()).toEqual({ x: 1, y: 6, zuKlaeren: 0 });
      expect(svc.istEntschieden(`${M}/az`)).toBeTrue();
    });

    it('Wirkung markierung ("zu klaeren") parkt den Punkt: weder offen noch entschieden (#41)', () => {
      state.setElementProfile(`${M}/az`, { status: S.markierung });

      expect(svc.istEntschieden(`${M}/az`)).toBeFalse();
      expect(svc.offeneSet().has(`${M}/az`)).toBeFalse();
      expect(svc.geparkteSet().has(`${M}/az`)).toBeTrue();
      // Drei getrennte Zahlen: entschieden, offen, zu klaeren.
      expect(svc.fortschritt()).toEqual({ x: 0, y: 6, zuKlaeren: 1 });

      // "Naechster offener" laeuft nicht mehr in den eigenen Merker.
      expect(svc.nextOpen(null)).not.toBe(`${M}/az`);

      // Eine echte Disposition loest die Parkstellung auf.
      state.setElementProfile(`${M}/az`, { status: S.optional });
      expect(svc.geparkteSet().size).toBe(0);
      expect(svc.fortschritt()).toEqual({ x: 1, y: 6, zuKlaeren: 0 });
    });

    it('im Instanz-Modus gibt es die vierte Entscheidung nicht (#41)', () => {
      state.setElementProfile(`${M}/az`, { status: S.markierung });
      state.messageCreate.set({ msgName: M, entryId: null, name: null });

      expect(svc.geparkteSet().size).toBe(0);
      expect(svc.fortschritt().zuKlaeren).toBe(0);
      expect(svc.setzeDisposition('markierung')).toBeFalse();
    });

    it('Anmerkung allein entscheidet nicht', () => {
      state.setElementProfile(`${M}/az`, { anmerkung: 'nur Notiz' });
      expect(svc.istEntschieden(`${M}/az`)).toBeFalse();
    });
  });

  describe('Abschneiden (nicht verwendet)', () => {
    it('nimmt den Teilbaum aus der Zaehlung; der Knoten selbst bleibt entschieden', () => {
      state.setElementProfile(`${M}/_auswahl`, { status: S.excl });
      expect(pfade()).toEqual([`${M}/az`, `${M}/_auswahl`, `${M}/beteiligung`, `${M}/_gruppe`]);
      expect(svc.fortschritt()).toEqual({ x: 1, y: 4, zuKlaeren: 0 });
    });

    it('ist nicht-destruktiv: Ruecknahme stellt Unter-Entscheidungen wieder her', () => {
      state.setElementProfile(`${M}/_auswahl/email`, { status: S.optional });
      state.setElementProfile(`${M}/_auswahl`, { status: S.excl });
      expect(pfade()).not.toContain(`${M}/_auswahl/email`);
      state.setElementProfile(`${M}/_auswahl`, { status: undefined });
      expect(pfade()).toContain(`${M}/_auswahl/email`);
      expect(svc.istEntschieden(`${M}/_auswahl/email`)).toBeTrue();
    });
  });

  describe('Auspraegungen', () => {
    it('ersetzt den generischen Unterbaum und zaehlt je Auspraegung', () => {
      const a = state.addAusp(`${M}/beteiligung`, 'Klaeger');
      const b = state.addAusp(`${M}/beteiligung`, 'Beklagter');
      const p = pfade();
      expect(p).toContain(`${M}/beteiligung@${a}`);
      expect(p).toContain(`${M}/beteiligung@${b}`);
      expect(svc.fortschritt().y).toBe(8);
      // Reihenfolge: Auspraegungen direkt nach dem Element, vor der Gruppe.
      expect(p.indexOf(`${M}/beteiligung@${a}`)).toBeGreaterThan(p.indexOf(`${M}/beteiligung`));
      expect(p.indexOf(`${M}/beteiligung@${b}`)).toBeLessThan(p.indexOf(`${M}/_gruppe`));
    });

    it('Pflicht-Kinder einer Auspraegung sind keine Punkte', () => {
      const a = state.addAusp(`${M}/beteiligung`, 'Klaeger');
      expect(pfade()).not.toContain(`${M}/beteiligung@${a}/name`);
    });
  });

  describe('Spur-Navigation (nextOpen)', () => {
    it('liefert den naechsten offenen Punkt nach der aktuellen Position', () => {
      expect(svc.nextOpen(null)).toBe(`${M}/az`);
      expect(svc.nextOpen(`${M}/az`)).toBe(`${M}/_auswahl`);
      expect(svc.nextOpen(`${M}/kopf`)).toBe(`${M}/az`); // Nicht-Punkt als Startposition
    });

    it('ueberspringt Entschiedenes und wrappt an den Anfang', () => {
      state.setElementProfile(`${M}/beteiligung`, { status: S.excl });
      state.setElementProfile(`${M}/_gruppe`, { status: S.excl });
      expect(svc.nextOpen(`${M}/_auswahl/telefon`)).toBe(`${M}/az`); // Wrap
    });

    it('liefert null, wenn alles entschieden ist', () => {
      for (const p of pfade()) state.setElementProfile(p, { status: S.excl });
      expect(svc.nextOpen(null)).toBeNull();
    });
  });

  describe('Disposition per Tastatur (setzeDisposition)', () => {
    let nav: NavService;

    const waehle = (path: string): void => {
      nav = TestBed.inject(NavService);
      const it = nav.findItemByPath(path);
      expect(it).withContext(path).not.toBeNull();
      state.selItem.set(it);
    };

    const selPath = (): string | null => {
      const it = state.selItem();
      return it ? itemPath(it) : null;
    };

    it('setzt die Stufe gemaess Wirkung und springt zum naechsten offenen Punkt', () => {
      waehle(`${M}/az`);
      expect(svc.setzeDisposition('pflicht')).toBeTrue();
      expect(state.elemente()[`${M}/az`]?.status).toBe(S.pflicht);
      expect(selPath()).toBe(`${M}/_auswahl`); // Auto-Sprung
    });

    it('bildet optional und ausgeschlossen auf die passenden Stufen ab', () => {
      waehle(`${M}/az`);
      svc.setzeDisposition('optional');
      expect(state.elemente()[`${M}/az`]?.status).toBe(S.optional);
      waehle(`${M}/beteiligung`);
      svc.setzeDisposition('ausgeschlossen');
      expect(state.elemente()[`${M}/beteiligung`]?.status).toBe(S.excl);
    });

    it('kaskadiert die Zwingend-Vorbelegung in das Pflicht-Rueckgrat darunter', () => {
      waehle(`${M}/beteiligung`);
      const y0 = svc.fortschritt().y;
      svc.setzeDisposition('pflicht');
      expect(state.elemente()[`${M}/beteiligung/name`]?.status).toBe(S.pflicht);
      // Kaskadierte Pflicht ist per Definition erledigt — keine neuen Fragen.
      expect(svc.fortschritt().y).toBe(y0);
    });

    it('tut ohne Selektion nichts und meldet false', () => {
      state.selItem.set(null);
      expect(svc.setzeDisposition('pflicht')).toBeFalse();
      expect(Object.keys(state.elemente()).length).toBe(0);
    });

    it('tut ohne konfigurierte Stufe nichts und meldet false', () => {
      state.statuses.set(state.statuses().filter((s) => s.wirkung !== 'optional'));
      waehle(`${M}/az`);
      expect(svc.setzeDisposition('optional')).toBeFalse();
      expect(state.elemente()[`${M}/az`]?.status).toBeUndefined();
      expect(selPath()).toBe(`${M}/az`); // kein Sprung
    });
  });

  describe('Auswahl-Schritt (choice)', () => {
    it('setzeZweig schliesst den Zweig aus und markiert die Pflicht-Auswahl als entschieden', () => {
      svc.setzeZweig(`${M}/_auswahl`, `${M}/_auswahl/telefon`, false);
      expect(state.wirkungOf(`${M}/_auswahl/telefon`)).toBe('ausgeschlossen');
      expect(svc.istEntschieden(`${M}/_auswahl`)).toBeTrue(); // Marker (pflicht) gesetzt
      expect(svc.istEntschieden(`${M}/_auswahl/email`)).toBeFalse(); // Rest weiter offen
    });

    it('setzeZweig(zulaessig) entfernt den Ausschluss, Marker bleibt', () => {
      svc.setzeZweig(`${M}/_auswahl`, `${M}/_auswahl/telefon`, false);
      svc.setzeZweig(`${M}/_auswahl`, `${M}/_auswahl/telefon`, true);
      expect(state.wirkungOf(`${M}/_auswahl/telefon`)).toBeNull();
      expect(svc.istEntschieden(`${M}/_auswahl`)).toBeTrue();
    });

    it('bestaetigeAuswahl markiert "alle zulaessig" ohne Zweig-Ausschluss', () => {
      svc.bestaetigeAuswahl(`${M}/_auswahl`);
      expect(svc.istEntschieden(`${M}/_auswahl`)).toBeTrue();
      expect(state.wirkungOf(`${M}/_auswahl/email`)).toBeNull();
      expect(state.wirkungOf(`${M}/_auswahl/telefon`)).toBeNull();
    });

    it('ueberschreibt eine vorhandene Gruppen-Disposition nicht', () => {
      state.setElementProfile(`${M}/_auswahl`, { status: S.excl });
      svc.bestaetigeAuswahl(`${M}/_auswahl`);
      expect(state.wirkungOf(`${M}/_auswahl`)).toBe('ausgeschlossen');
    });
  });

  describe('Freitext-Vorschlaege', () => {
    it('dedupliziert, trimmt und sortiert die verwendeten Anmerkungen', () => {
      state.setElementProfile(`${M}/az`, { anmerkung: ' nur bei Auslandsbezug ' });
      state.setElementProfile(`${M}/beteiligung`, { anmerkung: 'nur bei Auslandsbezug' });
      state.setElementProfile(`${M}/_gruppe`, { anmerkung: 'abgestimmt mit BLK' });
      expect(svc.anmerkungVorschlaege()).toEqual(['abgestimmt mit BLK', 'nur bei Auslandsbezug']);
    });
  });

  // ── Instanz-Modus (US "Testnachricht gefuehrt erstellen") ─────────────

  describe('Instanz-Modus', () => {
    beforeEach(() => {
      state.messageCreate.set({ msgName: M, entryId: null, name: null });
    });

    it('Stationen: Blaetter als Wert-Punkte, Container als Angabe-Punkt, kein Abstieg in Uebergangenes', () => {
      expect(pfade()).toEqual([
        `${M}/kopf`, // Pflicht-Blatt → Wert noetig
        `${M}/az`,
        `${M}/_auswahl`,
        `${M}/beteiligung`,
        `${M}/_gruppe`,
      ]);
      const arten = Object.fromEntries(svc.punkte().map((p) => [p.path, p.art]));
      expect(arten[`${M}/kopf`]).toBe('wert');
      // Optionales Blatt: freies Feld, keine Ja/Nein-Frage (ADR 0016).
      expect(arten[`${M}/az`]).toBe('wert');
      expect(svc.punktAt(`${M}/az`)?.pflicht).toBeFalse();
      // Optionaler Container: Station "angeben / uebergehen".
      expect(arten[`${M}/beteiligung`]).toBe('element');
      expect(arten[`${M}/_gruppe`]).toBe('element');
      expect(arten[`${M}/_auswahl`]).toBe('auswahl');
      // Zweige und Pflicht-Kinder uebergangener Gruppen sind keine Stationen.
      expect(pfade()).not.toContain(`${M}/_auswahl/email`);
      expect(pfade()).not.toContain(`${M}/_gruppe/detail`);
    });

    it('optionales Blatt ist nie offen — ohne Wert entfaellt es einfach', () => {
      expect(svc.punkte().some((p) => p.path === `${M}/az`)).toBeTrue();
      expect(svc.offeneSet().has(`${M}/az`)).toBeFalse();
      // Auch nach dem Blaettern bleibt nichts zurueck: kein Status, keine Aussage.
      expect(state.elemente()[`${M}/az`]).toBeUndefined();
      state.setElementProfile(`${M}/az`, { beispiel: '12 C 34/26' });
      expect(svc.offeneSet().has(`${M}/az`)).toBeFalse();
    });

    it('optionaler Container ist nie offen; Angabe und Ruecknahme steuern nur den Abstieg', () => {
      expect(svc.offeneSet().has(`${M}/_gruppe`)).toBeFalse();
      svc.gibAn(`${M}/_gruppe`);
      expect(svc.offeneSet().has(`${M}/_gruppe`)).toBeFalse();
      expect(svc.gibNichtAn(`${M}/_gruppe`)).toBeTrue();
      expect(state.wirkungOf(`${M}/_gruppe`)).toBeFalsy(); // kein Ausschluss, nur nichts
    });

    it('Wert-Punkt: entschieden erst mit nicht-leerem Wert', () => {
      expect(svc.offeneSet().has(`${M}/kopf`)).toBeTrue();
      state.setElementProfile(`${M}/kopf`, { beispiel: '   ' });
      expect(svc.offeneSet().has(`${M}/kopf`)).toBeTrue(); // nur Whitespace zaehlt nicht
      state.setElementProfile(`${M}/kopf`, { beispiel: 'Az 1' });
      expect(svc.offeneSet().has(`${M}/kopf`)).toBeFalse();
    });

    it('offenePflicht zaehlt nur Schema-kritische Punkte (Pflichtwert + Pflicht-Auswahl)', () => {
      expect(svc.offenePflicht()).toBe(2); // kopf + _auswahl
      state.setElementProfile(`${M}/kopf`, { beispiel: 'x' });
      expect(svc.offenePflicht()).toBe(1); // _auswahl
    });

    it('Fortschritt zaehlt nur geschuldete Angaben; ein freies Feld erst mit Wert', () => {
      // kopf (Pflichtwert) + _auswahl (Pflicht-Auswahl) — az, beteiligung und
      // _gruppe sind Stationen, aber keine Schuld.
      expect(svc.fortschritt()).toEqual({ x: 0, y: 2, zuKlaeren: 0 });
      state.setElementProfile(`${M}/kopf`, { beispiel: 'x' });
      expect(svc.fortschritt()).toEqual({ x: 1, y: 2, zuKlaeren: 0 });
      // Wer etwas angibt, schuldet auch einen brauchbaren Wert.
      state.setElementProfile(`${M}/az`, { beispiel: '12 C 34/26' });
      expect(svc.fortschritt()).toEqual({ x: 2, y: 3, zuKlaeren: 0 });
    });

    it('typwidriger Wert in einem freien Feld ist offen und kritisch', () => {
      ladeTypFixture();
      state.messageCreate.set({ msgName: M4, entryId: null, name: null });
      const datum = `${M4}/datum`;
      expect(svc.punktAt(datum)?.pflicht).toBeFalse();
      expect(svc.offeneSet().has(datum)).toBeFalse(); // leer ist eine gueltige Antwort

      state.setElementProfile(datum, { beispiel: '31.12.2026' });
      expect(svc.offeneSet().has(datum)).toBeTrue();
      expect(svc.offenePflicht()).toBe(1);

      state.setElementProfile(datum, { beispiel: '2026-12-31' });
      expect(svc.offeneSet().has(datum)).toBeFalse();
      expect(svc.offenePflicht()).toBe(0);
    });

    it('waehleZweig: genau ein Zweig, gewaehltes Blatt braucht einen Wert', () => {
      svc.waehleZweig(`${M}/_auswahl`, `${M}/_auswahl/email`);
      expect(state.wirkungOf(`${M}/_auswahl/email`)).toBe('pflicht');
      expect(state.wirkungOf(`${M}/_auswahl/telefon`)).toBe('ausgeschlossen');
      expect(svc.offeneSet().has(`${M}/_auswahl`)).toBeFalse(); // Auswahl entschieden
      // Der gewaehlte Blatt-Zweig ist jetzt ein offener Wert-Punkt.
      const email = svc.punktAt(`${M}/_auswahl/email`);
      expect(email?.art).toBe('wert');
      expect(svc.offeneSet().has(`${M}/_auswahl/email`)).toBeTrue();
      state.setElementProfile(`${M}/_auswahl/email`, { beispiel: 'a@b.de' });
      expect(svc.offeneSet().has(`${M}/_auswahl/email`)).toBeFalse();
    });

    it('Zweigwechsel ist nicht-destruktiv; abgewaehlter Zweig mit Wert zaehlt nicht als offen', () => {
      svc.waehleZweig(`${M}/_auswahl`, `${M}/_auswahl/telefon`);
      state.setElementProfile(`${M}/_auswahl/telefon`, { beispiel: '0301234' });
      svc.waehleZweig(`${M}/_auswahl`, `${M}/_auswahl/email`);
      expect(state.wirkungOf(`${M}/_auswahl/telefon`)).toBe('ausgeschlossen');
      expect(state.elemente()[`${M}/_auswahl/telefon`]?.beispiel).toBe('0301234'); // Wert bleibt
      expect(svc.offeneSet().has(`${M}/_auswahl/telefon`)).toBeFalse();
    });

    it('Zweigwechsel umgeht die Mindestanzahl der Profilierung nicht', () => {
      // Die Wahl schliesst die Geschwister aus — verlangt die Profilierung einen
      // davon, waere das ✕ am Zweig gesperrt, der Radio-Klick auf den Nachbarn
      // schloesse ihn aber still aus (Issue #50).
      state.setVorgabe({
        meta: {},
        statuses: [{ id: 'w1', name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' }],
        elemente: { [`${M}/_auswahl/email`]: { min: '1' } },
        auspraegungen: {},
        erweiterungen: {},
      });

      const grund = svc.kardSperreZweigwechsel(`${M}/_auswahl`, `${M}/_auswahl/telefon`);
      expect(grund).toContain('Profilierung');
      svc.waehleZweig(`${M}/_auswahl`, `${M}/_auswahl/telefon`);
      expect(state.wirkungOf(`${M}/_auswahl/email`)).not.toBe('ausgeschlossen');
      expect(state.wirkungOf(`${M}/_auswahl/telefon`)).not.toBe('pflicht');

      // Auf den verlangten Zweig selbst darf gewechselt werden.
      expect(svc.kardSperreZweigwechsel(`${M}/_auswahl`, `${M}/_auswahl/email`)).toBeNull();
      svc.waehleZweig(`${M}/_auswahl`, `${M}/_auswahl/email`);
      expect(state.wirkungOf(`${M}/_auswahl/email`)).toBe('pflicht');
    });

    it('angeben steigt ab (neue Stationen), Ruecknahme nimmt sie wieder heraus', () => {
      const y0 = svc.fortschritt().y;
      svc.gibAn(`${M}/_gruppe`);
      expect(pfade()).toContain(`${M}/_gruppe/detail`); // Pflicht-Blatt der Gruppe
      expect(svc.fortschritt().y).toBe(y0 + 1); // erst jetzt geschuldet
      expect(svc.gibNichtAn(`${M}/_gruppe`)).toBeTrue();
      expect(pfade()).not.toContain(`${M}/_gruppe/detail`);
      expect(svc.fortschritt().y).toBe(y0);
    });

    it('ein befuellter Teilbaum bleibt: die Angabe laesst sich nicht zuruecknehmen', () => {
      svc.gibAn(`${M}/_gruppe`);
      state.setElementProfile(`${M}/_gruppe/detail`, { beispiel: 'Wert' });
      expect(svc.angabeSperre(`${M}/_gruppe`)).toContain('Angaben');
      expect(svc.gibNichtAn(`${M}/_gruppe`)).toBeFalse();
      expect(pfade()).toContain(`${M}/_gruppe/detail`);
    });

    it('betreteStation gibt an und springt auf die erste Station darunter', () => {
      state.selItem.set(TestBed.inject(NavService).findItemByPath(`${M}/_gruppe`));
      expect(svc.betreteStation()).toBeTrue();
      expect(state.wirkungOf(`${M}/_gruppe`)).toBe('pflicht');
      const sel = state.selItem();
      expect(sel && itemPath(sel)).toBe(`${M}/_gruppe/detail`);
      // An einer Wert-Station greift die Taste nicht — dort gilt die Baum-Navigation.
      expect(svc.betreteStation()).toBeFalse();
      // Von dort fuehrt ↑ zurueck auf den Container.
      expect(svc.gotoUebergeordnet()).toBeTrue();
      const oben = state.selItem();
      expect(oben && itemPath(oben)).toBe(`${M}/_gruppe`);
    });

    it('ein einzig befuellter Auswahl-Zweig gilt als gewaehlt', () => {
      // ADR 0016: es reicht, einen Wert anzugeben — auch an der Auswahl.
      expect(svc.gewaehlterZweig(`${M}/_auswahl`)).toBeNull();
      state.setElementProfile(`${M}/_auswahl/email`, { beispiel: 'a@b.de' });
      expect(svc.gewaehlterZweig(`${M}/_auswahl`)).toBe(`${M}/_auswahl/email`);
      expect(svc.offeneSet().has(`${M}/_auswahl`)).toBeFalse();

      // Zwei befuellte Zweige sind mehrdeutig — die Auswahl bleibt offen.
      state.setElementProfile(`${M}/_auswahl/telefon`, { beispiel: '0301234' });
      expect(svc.gewaehlterZweig(`${M}/_auswahl`)).toBeNull();
      expect(svc.offeneSet().has(`${M}/_auswahl`)).toBeTrue();

      // Die ausdrueckliche Wahl entscheidet den Gleichstand.
      svc.waehleZweig(`${M}/_auswahl`, `${M}/_auswahl/telefon`);
      expect(svc.gewaehlterZweig(`${M}/_auswahl`)).toBe(`${M}/_auswahl/telefon`);
    });

    it('gespeicherte Altstaende bleiben lesbar (aufnehmen/weglassen von frueher)', () => {
      // Entwuerfe vor ADR 0016 tragen an optionalen Elementen `pflicht`
      // (aufgenommen) bzw. `ausgeschlossen` (weggelassen). Beides muss sich
      // weiter so verhalten wie beim Speichern, sonst kippt ein fortgesetzter
      // Entwurf still seinen Inhalt.
      state.setElementProfile(`${M}/_gruppe`, { status: S.pflicht }); // aufgenommen
      expect(pfade()).toContain(`${M}/_gruppe/detail`);

      state.setElementProfile(`${M}/beteiligung`, { status: S.excl }); // weggelassen
      const a = state.addAusp(`${M}/beteiligung`, 'Vorkommen 1');
      expect(pfade()).not.toContain(`${M}/beteiligung@${a}/name`);
      expect(svc.offeneSet().has(`${M}/beteiligung`)).toBeFalse();
    });

    it('Vorkommen (Auspraegungen) zaehlen; ihre Pflicht-Blaetter sind Wert-Punkte', () => {
      svc.gibAn(`${M}/beteiligung`);
      const a = state.addAusp(`${M}/beteiligung`, 'Vorkommen 1');
      const p = pfade();
      expect(p).toContain(`${M}/beteiligung@${a}`);
      expect(p).toContain(`${M}/beteiligung@${a}/name`);
      expect(svc.punktAt(`${M}/beteiligung@${a}/name`)?.art).toBe('wert');
    });

    it('fuellePflichtfelder befuellt offene Pflichtwerte typkonform', () => {
      const n = svc.fuellePflichtfelder();
      expect(n).toBe(1); // kopf
      expect(state.elemente()[`${M}/kopf`]?.beispiel).toBeTruthy();
      expect(svc.offenePflicht()).toBe(1); // Auswahl bleibt (keine Wert-Frage)
      svc.waehleZweig(`${M}/_auswahl`, `${M}/_auswahl/email`);
      expect(svc.fuellePflichtfelder()).toBe(1); // gewaehlter Zweig
      expect(svc.offenePflicht()).toBe(0);
    });
  });

  describe('Gebundener Durchlauf: Ausgeschlossenes der Vorgabe', () => {
    /** Vorgabe mit eigener Stufenliste (v9 = ausgeschlossen). */
    const bindeVorgabe = (
      elemente: Record<string, { status?: string }>,
      auspraegungen: Record<string, { id: string; name: string }[]> = {},
    ): void => {
      state.setVorgabe({
        meta: {},
        statuses: [
          { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
        ],
        elemente,
        auspraegungen,
        erweiterungen: {},
      });
    };

    beforeEach(() => {
      state.messageCreate.set({ msgName: M, entryId: null, name: null });
    });

    it('ist kein Entscheidungspunkt — weder optionales Element noch Pflicht-Blatt', () => {
      bindeVorgabe({ [`${M}/az`]: { status: 'v9' }, [`${M}/kopf`]: { status: 'v9' } });

      expect(pfade()).toEqual([`${M}/_auswahl`, `${M}/beteiligung`, `${M}/_gruppe`]);
      expect(svc.punktAt(`${M}/az`)).toBeNull();
      expect(svc.offeneSet().has(`${M}/kopf`)).toBeFalse();
      expect(svc.offenePflicht()).toBe(1); // nur die Auswahl
    });

    it('vererbt den Ausschluss auf den Teilbaum (auch auf Vorkommen der Vorgabe)', () => {
      bindeVorgabe(
        { [`${M}/beteiligung`]: { status: 'v9' } },
        {
          [`${M}/beteiligung`]: [{ id: 'v1', name: 'Notar/in' }],
        },
      );

      const p = pfade();
      expect(p).not.toContain(`${M}/beteiligung`);
      expect(p).not.toContain(`${M}/beteiligung@v1`);
      expect(p).not.toContain(`${M}/beteiligung@v1/name`);
    });

    it('schneidet einen ausgeschlossenen Auswahl-Zweig aus der Auswahl heraus', () => {
      bindeVorgabe({ [`${M}/_auswahl/telefon`]: { status: 'v9' } });
      svc.waehleZweig(`${M}/_auswahl`, `${M}/_auswahl/email`);

      expect(pfade()).toContain(`${M}/_auswahl/email`);
      expect(pfade()).not.toContain(`${M}/_auswahl/telefon`);
    });

    it('laesst uebergangene Stationen des Durchlaufs als Station stehen', () => {
      bindeVorgabe({});

      // Uebergangenes bleibt Station (jederzeit nachtragbar) — anders als
      // Ausgeschlossenes der Vorgabe, das gar nicht erst auftaucht.
      expect(pfade()).toContain(`${M}/az`);
      expect(svc.offeneSet().has(`${M}/az`)).toBeFalse();
    });

    it('fuellePflichtfelder ruehrt Ausgeschlossenes nicht an', () => {
      bindeVorgabe({ [`${M}/kopf`]: { status: 'v9' } });

      expect(svc.fuellePflichtfelder()).toBe(0);
      expect(state.elemente()[`${M}/kopf`]).toBeUndefined();
    });
  });

  // ── Wirkungen der Vorgabe im Durchlauf (Issue #26) ────────────────────

  describe('Gebundener Durchlauf: Wirkungen der Vorgabe', () => {
    /** Vorgabe mit eigener Stufenliste (w1 pflicht, w2 optional, w3 excl, w4 markierung). */
    const V = { pflicht: 'w1', optional: 'w2', excl: 'w3', markierung: 'w4' };

    const bindeVorgabe = (
      elemente: Record<string, ElementProfile>,
      erweiterungen: Record<string, Erweiterung[]> = {},
      auspraegungen: Record<string, { id: string; name: string }[]> = {},
    ): void => {
      state.setVorgabe({
        meta: {},
        statuses: [
          { id: V.pflicht, name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' },
          { id: V.optional, name: 'anzugeben, wenn vorhanden', farbe: '#0a0', wirkung: 'optional' },
          { id: V.excl, name: 'nicht verwendet', farbe: '#888', wirkung: 'ausgeschlossen' },
          { id: V.markierung, name: 'zu klären', farbe: '#fa0', wirkung: 'markierung' },
        ],
        elemente,
        auspraegungen,
        erweiterungen,
      });
    };

    beforeEach(() => {
      state.messageCreate.set({ msgName: M, entryId: null, name: null });
    });

    describe('Vorkommen erben die generische Festlegung (Issue #59)', () => {
      it('ausgeschlossenes Kind erzeugt im benannten Vorkommen keinen Entscheidungspunkt', () => {
        // Die Profilierung adressiert `…/beteiligung/name`; im Baum steht das
        // Element unter dem Vorkommen (`…/beteiligung@v1/name`). Ohne Auflösung
        // des Vorkommen-Pfades blieb es dort ein offener Punkt und war
        // befuellbar — obwohl die gebundene Fassung es ausschliesst.
        bindeVorgabe(
          // Der Traeger ist zwingend, damit der Walk ueberhaupt in den Teilbaum
          // laeuft — sonst liefe die Zusicherung leer.
          {
            [`${M}/beteiligung`]: { status: V.pflicht },
            [`${M}/beteiligung/name`]: { status: V.excl },
          },
          {},
          { [`${M}/beteiligung`]: [{ id: 'v1', name: 'Notar/in' }] },
        );

        expect(pfade()).toContain(`${M}/beteiligung@v1`);

        expect(state.vorgabeGesperrt(`${M}/beteiligung@v1/name`)).toBeTrue();
        expect(pfade()).not.toContain(`${M}/beteiligung@v1/name`);
        expect(svc.punktAt(`${M}/beteiligung@v1/name`)).toBeNull();
      });

      it('der exakte Vorkommen-Pfad der Vorgabe gewinnt: dort bleibt es zwingend', () => {
        bindeVorgabe(
          {
            [`${M}/beteiligung`]: { status: V.pflicht },
            [`${M}/beteiligung/name`]: { status: V.excl },
            [`${M}/beteiligung@v1/name`]: { status: V.pflicht },
          },
          {},
          {
            [`${M}/beteiligung`]: [
              { id: 'v1', name: 'Notar/in' },
              { id: 'v2', name: 'Betroffene Person' },
            ],
          },
        );

        expect(state.vorgabeGesperrt(`${M}/beteiligung@v1/name`)).toBeFalse();
        expect(svc.punktAt(`${M}/beteiligung@v1/name`)?.art).toBe('wert');
        // Das Nachbar-Vorkommen ohne eigene Unter-Profilierung bleibt gesperrt.
        expect(state.vorgabeGesperrt(`${M}/beteiligung@v2/name`)).toBeTrue();
      });

      it('zwingendes Vorkommen ist nicht entfernbar und nennt den Grund', () => {
        // Spec: "zwingende Auspraegungen sind von Anfang an vorhanden und nicht
        // entfernbar". Massgeblich ist die Aussage der gebundenen Fassung zum
        // Vorkommen selbst — eine Auspraegung ohne eigene Festlegung bleibt
        // entfernbar, sie ist in bestehenden Profilierungen als Beschreibung
        // gemeint und nicht als Leitplanke (#28).
        bindeVorgabe(
          {
            [`${M}/beteiligung`]: { status: V.pflicht },
            [`${M}/beteiligung@n1`]: { status: V.pflicht },
          },
          {},
          {
            [`${M}/beteiligung`]: [
              { id: 'n1', name: 'Notar/in' },
              { id: 'n2', name: 'Betroffene Person' },
            ],
          },
        );

        const grund = svc.auspSperreEntfernen(`${M}/beteiligung`, 'n1');
        expect(grund).toContain('Notar/in');
        expect(grund).toContain('zwingend');
        // Ohne eigene Festlegung bleibt das Nachbar-Vorkommen entfernbar.
        expect(svc.auspSperreEntfernen(`${M}/beteiligung`, 'n2')).toBeNull();
      });

      it('beim Profilieren sind Vorkommen frei — die Sperre gilt nur im Durchlauf', () => {
        bindeVorgabe(
          { [`${M}/beteiligung@n1`]: { status: V.pflicht } },
          {},
          { [`${M}/beteiligung`]: [{ id: 'n1', name: 'Notar/in' }] },
        );
        state.messageCreate.set(null); // Profil-Modus

        expect(svc.auspSperreEntfernen(`${M}/beteiligung`, 'n1')).toBeNull();
      });

      it('unbekannter Pfad sperrt nicht (Nachlese zu #27, #49)', () => {
        bindeVorgabe({ [`${M}/beteiligung`]: { min: '2', max: '3' } });

        // Was der Baum nicht kennt, rendert er auch nicht — es gibt dort weder
        // einen Knopf zu sperren noch ein Vorkommen zu schuetzen.
        expect(svc.kardSperreHinzu(`${M}/gibtsnicht`)).toBeNull();
        expect(svc.kardSperreEntfernen(`${M}/gibtsnicht`)).toBeNull();
        expect(svc.kardSperreWeglassen(`${M}/gibtsnicht`)).toBeNull();
        // Am bekannten Pfad greift dieselbe Eingrenzung weiterhin.
        expect(svc.kardSperreWeglassen(`${M}/beteiligung`)).toContain('2');
      });

      it('optionales Vorkommen ist eine Container-Station (#28)', () => {
        // Spec #28: ein optionales Vorkommen ist eine eigene Station — ohne
        // diese Unterscheidung galte es mit seinem blossen Dasein als
        // aufgenommen. Seit ADR 0016 ist es eine Station ohne Schuld: der
        // Durchlauf kann sie uebergehen.
        bindeVorgabe(
          {
            [`${M}/beteiligung`]: { status: V.pflicht },
            [`${M}/beteiligung@n1`]: { status: V.pflicht },
            [`${M}/beteiligung@n2`]: { status: V.optional },
          },
          {},
          {
            [`${M}/beteiligung`]: [
              { id: 'n1', name: 'Notar/in' },
              { id: 'n2', name: 'Zeuge/Zeugin' },
            ],
          },
        );

        // Zwingend: da, verlangt. Optional: Station, aber nie offen.
        expect(svc.punktAt(`${M}/beteiligung@n1`)?.art).toBe('auspraegung');
        expect(svc.punktAt(`${M}/beteiligung@n2`)?.art).toBe('element');
        expect(svc.offeneSet().has(`${M}/beteiligung@n2`)).toBeFalse();
        // In das uebergangene Vorkommen steigt der Durchlauf nicht ab.
        expect(pfade()).not.toContain(`${M}/beteiligung@n2/name`);

        svc.gibAn(`${M}/beteiligung@n2`);
        expect(pfade()).toContain(`${M}/beteiligung@n2/name`);

        expect(svc.gibNichtAn(`${M}/beteiligung@n2`)).toBeTrue();
        expect(pfade()).not.toContain(`${M}/beteiligung@n2/name`);
      });

      it('eine selbst angelegte Kopie ist angegeben, kein neuer offener Punkt', () => {
        bindeVorgabe(
          {
            [`${M}/beteiligung`]: { status: V.pflicht },
            [`${M}/beteiligung@n2`]: { status: V.optional },
          },
          {},
          { [`${M}/beteiligung`]: [{ id: 'n2', name: 'Zeuge/Zeugin' }] },
        );
        state.copyAusp(`${M}/beteiligung`, 'n2');

        const kopie = state.auspsOf(`${M}/beteiligung`)!.find((a) => a.vonId === 'n2')!;
        expect(svc.punktAt(`${M}/beteiligung@${kopie.id}`)?.art).toBe('auspraegung');
        expect(svc.offeneSet().has(`${M}/beteiligung@${kopie.id}`)).toBeFalse();
      });

      it('Verweisziele kennen die Vorkommen der gebundenen Fassung (#28)', () => {
        // `refZielKandidaten` las bisher allein die eigene Liste: im gebundenen
        // Durchlauf bot die Auswahl darum kein Ziel an, obwohl `auspLabel` eines
        // benennen konnte.
        bindeVorgabe(
          { [`${M}/beteiligung`]: { status: V.pflicht } },
          {},
          { [`${M}/beteiligung`]: [{ id: 'n1', name: 'Notar/in' }] },
        );

        const kand = state.refZielKandidaten('Rollennummer');
        expect(kand.map((k) => k.path)).toEqual([`${M}/beteiligung@n1`]);
        expect(kand[0]!.label).toContain('Notar/in');
      });

      it('Kandidaten fuer ein weiteres Vorkommen sind die profilierten Auspraegungen (#28)', () => {
        bindeVorgabe(
          { [`${M}/beteiligung`]: { status: V.pflicht } },
          {},
          {
            [`${M}/beteiligung`]: [
              { id: 'n1', name: 'Notar/in' },
              { id: 'n2', name: 'Zeuge/Zeugin' },
            ],
          },
        );

        expect(svc.auspKopieKandidaten(`${M}/beteiligung`)?.map((a) => a.name)).toEqual([
          'Notar/in',
          'Zeuge/Zeugin',
        ]);
        // Auch nachdem der Durchlauf ein Vorkommen entfernt hat: waehlbar bleibt,
        // was die Profilierung beschreibt.
        state.removeAusp(`${M}/beteiligung`, 'n1');
        expect(svc.auspKopieKandidaten(`${M}/beteiligung`)?.length).toBe(2);
        // Ohne Auspraegungen der Vorgabe bleibt die freie Anlage.
        expect(svc.auspKopieKandidaten(`${M}/anlage`)).toBeNull();

        state.messageCreate.set(null); // beim Profilieren gilt die Kopier-Pflicht nicht
        expect(svc.auspKopieKandidaten(`${M}/beteiligung`)).toBeNull();
      });

      it('die Kopie erbt die Unter-Profilierung ihrer Quelle (#28)', () => {
        bindeVorgabe(
          {
            [`${M}/beteiligung`]: { status: V.pflicht },
            [`${M}/beteiligung/name`]: { status: V.excl },
            [`${M}/beteiligung@n1/name`]: { status: V.pflicht, beispiel: 'Musterfrau' },
          },
          {},
          { [`${M}/beteiligung`]: [{ id: 'n1', name: 'Notar/in' }] },
        );
        state.copyAusp(`${M}/beteiligung`, 'n1');
        const kopie = state.auspsOf(`${M}/beteiligung`)!.find((a) => a.vonId === 'n1')!;

        // Generisch ausgeschlossen, in der Quelle zwingend — die Kopie folgt der
        // Quelle, nicht dem generischen Pfad.
        expect(state.vorgabeGesperrt(`${M}/beteiligung@${kopie.id}/name`)).toBeFalse();
        expect(svc.punktAt(`${M}/beteiligung@${kopie.id}/name`)?.art).toBe('wert');
        expect(state.vorgabeBeispiel(`${M}/beteiligung@${kopie.id}/name`)).toBe('Musterfrau');
      });

      it('eingegrenzte Kardinalitaet eines Kindpfads wirkt im Vorkommen', () => {
        // `kontakt` liegt INNERHALB des Vorkommen-Traegers und ist im Schema
        // unbegrenzt; die Profilierung grenzt generisch auf 1 ein. Ohne
        // Auflösung des Vorkommen-Pfades blieb das ohne Wirkung — der Trägerpfad
        // allein taugt als Nachweis nicht, dort ist nichts aufzuloesen.
        ladeVorkommenFixture();
        state.messageCreate.set({ msgName: M2, entryId: null, name: null });
        bindeVorgabe(
          {
            [`${M2}/beteiligung`]: { status: V.pflicht },
            [`${M2}/beteiligung/kontakt`]: { max: '1' },
          },
          {},
          { [`${M2}/beteiligung`]: [{ id: 'v1', name: 'Notar/in' }] },
        );
        state.addAusp(`${M2}/beteiligung@v1/kontakt`, 'Vorkommen 1');

        const grund = svc.kardSperreHinzu(`${M2}/beteiligung@v1/kontakt`);
        expect(grund).toContain('1');
        expect(grund).toContain('Profilierung');
      });
    });

    describe('zwingend gesetzt', () => {
      it('macht ein Schema-optionales Blatt zum Pflicht-Wert-Punkt', () => {
        bindeVorgabe({ [`${M}/az`]: { status: V.pflicht } });

        expect(svc.punktAt(`${M}/az`)?.art).toBe('wert');
        expect(svc.offeneSet().has(`${M}/az`)).toBeTrue();
        expect(svc.offenePflicht()).toBe(3); // kopf, _auswahl, az
        state.setElementProfile(`${M}/az`, { beispiel: '12 C 34/26' });
        expect(svc.offeneSet().has(`${M}/az`)).toBeFalse();
      });

      it('verlangt den Teilbaum: der Container wird ohne Rueckfrage betreten', () => {
        bindeVorgabe({ [`${M}/_gruppe`]: { status: V.pflicht } });

        // Keine Angabe-Station mehr — stattdessen sein Pflicht-Kind.
        expect(svc.punktAt(`${M}/_gruppe`)).toBeNull();
        expect(svc.punktAt(`${M}/_gruppe/detail`)?.art).toBe('wert');
        expect(svc.offeneSet().has(`${M}/_gruppe/detail`)).toBeTrue();
      });

      it('macht auch eine Profil-Mindestanzahl >= 1 zur Pflicht', () => {
        // Ohne Weglassen-Entscheidung gibt es keine Sperre mehr, an der die
        // Untergrenze haengen koennte — sie wirkt jetzt als Pflicht.
        bindeVorgabe({ [`${M}/az`]: { min: '1' } });

        expect(svc.punktAt(`${M}/az`)?.pflicht).toBeTrue();
        expect(svc.offeneSet().has(`${M}/az`)).toBeTrue();
        expect(svc.offenePflicht()).toBe(3); // kopf, _auswahl, az
      });

      it('greift erst, wenn der Durchlauf den Elternast betritt', () => {
        // Die Elternabhaengigkeit ist die Voraussetzung dafuer, dass "einfach
        // weiterblaettern" moeglich bleibt: was unter einem uebergangenen
        // Container liegt, verlangt der Durchlauf nicht — auch nicht, wenn die
        // Profilierung es zwingend setzt oder eine Mindestanzahl verlangt.
        bindeVorgabe({
          [`${M}/_gruppe/detail`]: { status: V.pflicht },
          [`${M}/beteiligung/name`]: { min: '1' },
        });

        expect(pfade()).not.toContain(`${M}/_gruppe/detail`);
        expect(pfade()).not.toContain(`${M}/beteiligung/name`);
        expect(svc.fortschritt()).toEqual({ x: 0, y: 2, zuKlaeren: 0 }); // kopf + _auswahl
        expect(svc.offenePflicht()).toBe(2);

        // Erst die Angabe holt die Pflicht in den Durchlauf.
        svc.gibAn(`${M}/_gruppe`);
        expect(pfade()).toContain(`${M}/_gruppe/detail`);
        expect(svc.fortschritt().y).toBe(3);
        expect(svc.offenePflicht()).toBe(3);
      });

      it('ein zwingendes Blatt bleibt Pflicht-Wert-Punkt', () => {
        bindeVorgabe({ [`${M}/az`]: { status: V.pflicht } });

        expect(svc.punktAt(`${M}/az`)?.art).toBe('wert');
        expect(svc.punktAt(`${M}/az`)?.pflicht).toBeTrue();
        expect(svc.angabeSperre(`${M}/az`)).toContain('zwingend');
      });

      it('gilt auch innerhalb eines Vorkommens — dort kennt die Profilierung nur den generischen Pfad', () => {
        // Die Vorgabe adressiert `…/beteiligung/rolle`; der Durchlauf fragt
        // `…/beteiligung@a/rolle`, denn die id entsteht erst zur Laufzeit.
        ladeVorkommenFixture();
        state.messageCreate.set({ msgName: M2, entryId: null, name: null });
        bindeVorgabe({ [`${M2}/beteiligung/rolle`]: { status: V.pflicht } });
        svc.gibAn(`${M2}/beteiligung`);
        const a = state.addAusp(`${M2}/beteiligung`, 'Kläger');
        const rolle = `${M2}/beteiligung@${a}/rolle`;

        // Pflicht-Wert-Punkt statt freiem Feld ...
        expect(svc.punktAt(rolle)?.art).toBe('wert');
        expect(svc.punktAt(rolle)?.pflicht).toBeTrue();
        expect(svc.offeneSet().has(rolle)).toBeTrue();
        // ... ohne Marker, denn die Profilierung hat sich festgelegt ...
        expect(svc.markerOf(rolle)).toBeNull();

        // ... und nicht abwaehlbar.
        expect(svc.angabeSperre(rolle)).toContain('zwingend');
      });
    });

    describe('anzugeben, wenn vorhanden', () => {
      it('bleibt ein freies Feld: der Wert entscheidet, nichts ist offen', () => {
        bindeVorgabe({ [`${M}/az`]: { status: V.optional } });

        expect(svc.punktAt(`${M}/az`)?.art).toBe('wert');
        expect(svc.punktAt(`${M}/az`)?.pflicht).toBeFalse();
        expect(svc.offeneSet().has(`${M}/az`)).toBeFalse();
        expect(svc.offenePflicht()).toBe(2); // kopf + _auswahl
      });
    });

    describe('reine Markierung ("zu klaeren")', () => {
      it('verhaelt sich wie optional: Station, nicht offen, kein Abstieg', () => {
        bindeVorgabe({ [`${M}/_gruppe`]: { status: V.markierung } });

        expect(svc.punktAt(`${M}/_gruppe`)?.art).toBe('element');
        expect(svc.offeneSet().has(`${M}/_gruppe`)).toBeFalse();
        expect(pfade()).not.toContain(`${M}/_gruppe/detail`); // erst mit der Angabe

        svc.gibAn(`${M}/_gruppe`);
        expect(pfade()).toContain(`${M}/_gruppe/detail`);
      });

      it('ist als ungeklaert gekennzeichnet — auch nach der eigenen Angabe', () => {
        bindeVorgabe({ [`${M}/az`]: { status: V.markierung } });

        expect(svc.markerOf(`${M}/az`)).toBe('zuklaeren');
        expect(svc.punktAt(`${M}/az`)?.marker).toBe('zuklaeren');

        // Die offene Frage der Profilierung bleibt offen, auch wenn der
        // Durchlauf das Element befuellt.
        state.setElementProfile(`${M}/az`, { beispiel: '12 C 34/26' });
        expect(svc.markerOf(`${M}/az`)).toBe('zuklaeren');
      });
    });

    describe('ohne Festlegung', () => {
      it('folgt der Schema-Semantik und traegt den Marker "nicht profiliert"', () => {
        bindeVorgabe({ [`${M}/az`]: { status: V.optional } });

        // Schema-Pflicht bleibt Pflicht, Schema-optional bleibt Entscheidungspunkt.
        expect(svc.punktAt(`${M}/kopf`)?.art).toBe('wert');
        expect(svc.punktAt(`${M}/beteiligung`)?.art).toBe('element');
        expect(svc.markerOf(`${M}/kopf`)).toBe('nichtprofiliert');
        expect(svc.punktAt(`${M}/beteiligung`)?.marker).toBe('nichtprofiliert');
        // Was die Profilierung festlegt, traegt den Marker nicht.
        expect(svc.markerOf(`${M}/az`)).toBeNull();
      });

      it('gilt nicht fuer Vorkommen — sie erben die Aussage ihres Traegerelements', () => {
        bindeVorgabe({
          [`${M}/beteiligung`]: { status: V.pflicht },
          [`${M}/beteiligung/name`]: { status: V.markierung },
        });
        // Vorkommen entstehen zur Laufzeit; ihre ids kennt die Profilierung nicht.
        const a = state.addAusp(`${M}/beteiligung`, 'Kläger');

        expect(svc.markerOf(`${M}/beteiligung@${a}`)).toBeNull();
        expect(svc.markerOf(`${M}/beteiligung@${a}/name`)).toBe('zuklaeren');
      });

      it('gibt es ohne gebundene Fassung nicht', () => {
        expect(svc.markerOf(`${M}/kopf`)).toBeNull();
        expect(svc.punktAt(`${M}/kopf`)?.marker).toBeUndefined();
      });
    });

    describe('Zaehlung der beruehrten Elemente (Sammelmeldung beim Speichern)', () => {
      it('zaehlt nur, was in der Nachricht landet', () => {
        bindeVorgabe({ [`${M}/az`]: { status: V.markierung } });

        // kopf: Schema-Pflicht ohne Festlegung. az: noch ohne Wert, also nicht
        // in der Nachricht — beruehrt wird es erst mit der Angabe (ADR 0016).
        expect(svc.markerZaehlung()).toEqual({ ungeklaert: 0, nichtProfiliert: 1 });

        state.setElementProfile(`${M}/az`, { beispiel: '12 C 34/26' });
        expect(svc.markerZaehlung()).toEqual({ ungeklaert: 1, nichtProfiliert: 1 });

        state.setElementProfile(`${M}/az`, { beispiel: undefined });
        expect(svc.markerZaehlung()).toEqual({ ungeklaert: 0, nichtProfiliert: 1 });
      });

      it('ist ohne gebundene Fassung leer', () => {
        expect(svc.markerZaehlung()).toEqual({ ungeklaert: 0, nichtProfiliert: 0 });
      });
    });

    describe('Schema-Erweiterungen der Profilierung', () => {
      const ERW: Erweiterung = {
        id: 'e1',
        name: 'zusatzAngabe',
        min: '1',
        max: '1',
        datentyp: 'string',
      };

      it('sind regulaere Entscheidungspunkte', () => {
        bindeVorgabe({}, { [M]: [ERW] });

        expect(svc.punktAt(`${M}/~e1`)?.art).toBe('wert');
        expect(svc.offeneSet().has(`${M}/~e1`)).toBeTrue();
        expect(svc.offenePflicht()).toBe(3); // kopf, _auswahl, Erweiterung

        state.setElementProfile(`${M}/~e1`, { beispiel: 'Zusatz' });
        expect(svc.offeneSet().has(`${M}/~e1`)).toBeFalse();
      });
    });

    // ── Werte: vorschlagen statt vorbelegen (Issue #29) ────────────────

    describe('Werte', () => {
      it('schreibt den Beispielwert der Profilierung nicht in das Feld', () => {
        bindeVorgabe({ [`${M}/kopf`]: { beispiel: 'Amtsgericht Musterstadt' } });

        expect(state.elemente()[`${M}/kopf`]).toBeUndefined();
        expect(svc.offeneSet().has(`${M}/kopf`)).toBeTrue();
        expect(svc.offenePflicht()).toBe(2); // kopf + Auswahl
      });

      it('gilt erst mit uebernommenem oder eigenem Wert als erledigt', () => {
        bindeVorgabe({ [`${M}/kopf`]: { beispiel: 'Amtsgericht Musterstadt' } });

        expect(svc.offeneSet().has(`${M}/kopf`)).toBeTrue();

        // Etwas anderes einzutragen erledigt den Punkt genauso wie das Uebernehmen.
        state.setElementProfile(`${M}/kopf`, { beispiel: 'Landgericht Beispielstadt' });
        expect(svc.offeneSet().has(`${M}/kopf`)).toBeFalse();
      });

      it('eine auf genau einen Wert eingeschraenkte Codeliste bleibt ebenfalls offen', () => {
        bindeVorgabe({ [`${M}/kopf`]: { werte: ['01'] } });

        expect(state.elemente()[`${M}/kopf`]).toBeUndefined();
        expect(svc.offeneSet().has(`${M}/kopf`)).toBeTrue();
      });

      it('fuellePflichtfelder uebernimmt den Beispielwert statt eines Zufallswerts', () => {
        bindeVorgabe({ [`${M}/kopf`]: { beispiel: 'Amtsgericht Musterstadt' } });

        expect(svc.fuellePflichtfelder()).toBe(1);
        expect(state.elemente()[`${M}/kopf`]?.beispiel).toBe('Amtsgericht Musterstadt');
      });
    });

    // ── Kardinalitaet hart durchsetzen (Issue #27) ─────────────────────

    describe('Kardinalitaet', () => {
      /** Fixture M2: `anlage` traegt die Schema-Kardinalitaet 2..3. */
      const anlage = `${M2}/anlage`;
      const beteiligung = `${M2}/beteiligung`;

      /** Vorgabe mit Kardinalitaets-Eingrenzung (Stufenliste wie oben). */
      const bindeKard = (elemente: Record<string, ElementProfile>): void => {
        ladeVorkommenFixture();
        state.messageCreate.set({ msgName: M2, entryId: null, name: null });
        bindeVorgabe(elemente);
      };

      it('sperrt ein weiteres Vorkommen bei der Hoechstanzahl des Profils und nennt sie', () => {
        bindeKard({ [anlage]: { max: '2' } });
        state.addAusp(anlage, 'Vorkommen 1');
        expect(svc.kardSperreHinzu(anlage)).toBeNull(); // eine Auspraegung = ein Vorkommen

        state.addAusp(anlage, 'Vorkommen 2');

        const grund = svc.kardSperreHinzu(anlage);
        expect(grund).toContain('2');
        expect(grund).toContain('Profilierung');
      });

      it('setzt ohne Eingrenzung im Profil die Schema-Hoechstanzahl durch', () => {
        bindeKard({});
        state.addAusp(anlage, 'Vorkommen 1');
        state.addAusp(anlage, 'Vorkommen 2');
        expect(svc.kardSperreHinzu(anlage)).toBeNull();

        state.addAusp(anlage, 'Vorkommen 3');

        const grund = svc.kardSperreHinzu(anlage);
        expect(grund).toContain('3');
        expect(grund).toContain('Schema');
        // Unbegrenzt Wiederholbares bleibt unbegrenzt.
        state.addAusp(beteiligung, 'Vorkommen 1');
        expect(svc.kardSperreHinzu(beteiligung)).toBeNull();
      });

      it('haelt die Mindestanzahl des Profils: Vorkommen darunter sind nicht entfernbar', () => {
        bindeKard({ [anlage]: { min: '3' } });
        state.addAusp(anlage, 'Vorkommen 1');
        state.addAusp(anlage, 'Vorkommen 2');
        state.addAusp(anlage, 'Vorkommen 3');

        const grund = svc.kardSperreEntfernen(anlage);
        expect(grund).toContain('3');
        expect(grund).toContain('Profilierung');

        // Ueber der Mindestanzahl ist wieder entfernbar.
        state.addAusp(anlage, 'Vorkommen 4');
        expect(svc.kardSperreEntfernen(anlage)).toBeNull();
      });

      it('setzt ohne Eingrenzung im Profil die Schema-Mindestanzahl durch', () => {
        bindeKard({});
        state.addAusp(anlage, 'Vorkommen 1');
        state.addAusp(anlage, 'Vorkommen 2');

        const grund = svc.kardSperreEntfernen(anlage);
        expect(grund).toContain('2');
        expect(grund).toContain('Schema');

        state.addAusp(anlage, 'Vorkommen 3');
        expect(svc.kardSperreEntfernen(anlage)).toBeNull();
      });

      it('greift nur im Durchlauf — beim Profilieren bleiben Auspraegungen frei', () => {
        ladeVorkommenFixture();
        state.messageCreate.set(null); // Profil-Modus
        state.addAusp(anlage, 'Klaeger');
        state.addAusp(anlage, 'Beklagter');
        state.addAusp(anlage, 'Zeuge');

        expect(svc.kardSperreHinzu(anlage)).toBeNull();
        expect(svc.kardSperreEntfernen(anlage)).toBeNull();
        expect(svc.kardSperreWeglassen(anlage)).toBeNull();
      });

      // ── Zaehlkonvention der Vorkommen (Issue #50) ──────────────────

      /**
       * Angabe entfernen wie beim **Bearbeiten** einer Nachricht — den Weg
       * "weglassen" gibt es im gefuehrten Neu-Durchlauf nicht mehr (ADR 0016),
       * der Ausschluss-Status bleibt aber die Modellform dafuer.
       */
      const entferneAngabe = (path: string): void => {
        state.setElementProfile(path, { status: state.exclStatus()!.id });
      };

      it('zaehlt ein weggelassenes Element als kein Vorkommen', () => {
        bindeKard({ [beteiligung]: { max: '1' } });

        // Ohne eigene Auspraegungen steht das enthaltene Element fuer genau ein
        // Vorkommen — die Hoechstanzahl 1 ist damit erreicht.
        expect(svc.kardSperreHinzu(beteiligung)).toContain('1');

        // Weggelassen traegt es keines; das erste Vorkommen ist wieder moeglich.
        entferneAngabe(beteiligung);
        expect(svc.kardSperreHinzu(beteiligung)).toBeNull();
      });

      it('setzt eine Mindestanzahl von 1 gegen das Weglassen durch, statt sie nur zu zaehlen', () => {
        bindeKard({ [beteiligung]: { min: '1' } });

        const grund = svc.kardSperreWeglassen(beteiligung);
        expect(grund).toContain('1');
        expect(grund).toContain('Profilierung');

        // Im Durchlauf laesst sich die Angabe darum nicht zuruecknehmen ...
        svc.gibAn(beteiligung);
        expect(svc.gibNichtAn(beteiligung)).toBeFalse();
        expect(state.wirkungOf(beteiligung)).toBe('pflicht');
      });

      it('laesst Optionales ohne Eingrenzung im Profil weiterhin uebergehen', () => {
        bindeKard({});

        expect(svc.kardSperreWeglassen(beteiligung)).toBeNull();

        svc.gibAn(beteiligung);
        expect(svc.gibNichtAn(beteiligung)).toBeTrue();
        expect(state.wirkungOf(beteiligung)).toBeFalsy();
      });

      it('sperrt nicht bei einer Mindestanzahl aus dem Schema', () => {
        bindeKard({});

        // `anlage` traegt minOccurs=2 aus dem Schema, das Profil grenzt nichts
        // ein. Auf diesem Zweig (`!minProfil`) ruht die ganze Begruendung der
        // ADR: sperrte er mit, waeren Pflicht-Rueckgrat und Zweigwechsel tot.
        // Der vorige Test genuegt dafuer nicht — dort ist schon `min < 1`
        // hinreichend, dieser Fall traegt `min = 2`.
        expect(svc.kardSperreWeglassen(anlage)).toBeNull();
      });
    });

    describe('Fortschritt', () => {
      it('zaehlt die profilbedingten Pflichtangaben mit', () => {
        // Ohne Bindung: kopf (Pflichtwert) und _auswahl (Pflicht-Auswahl).
        expect(svc.fortschritt()).toEqual({ x: 0, y: 2, zuKlaeren: 0 });

        bindeVorgabe(
          { [`${M}/beteiligung`]: { status: V.pflicht } },
          { [M]: [{ id: 'e1', name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' }] },
          { [`${M}/beteiligung`]: [{ id: 'v1', name: 'Notar/in' }] },
        );

        // Statt der Angabe-Station zu `beteiligung` stehen jetzt das zwingende
        // Vorkommen und sein Pflicht-Blatt an, dazu die Schema-Erweiterung.
        expect(pfade()).toContain(`${M}/beteiligung@v1`);
        expect(pfade()).toContain(`${M}/beteiligung@v1/name`);
        expect(pfade()).toContain(`${M}/~e1`);
        // Geschuldet sind die beiden neuen Pflichtwerte; das Vorkommen selbst
        // ist ein Container und schuldet nichts.
        expect(svc.fortschritt()).toEqual({ x: 0, y: 4, zuKlaeren: 0 });
      });
    });
  });
});
