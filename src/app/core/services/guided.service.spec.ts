import { TestBed } from '@angular/core/testing';
import { GuidedService } from './guided.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';
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
      expect(svc.fortschritt()).toEqual({ x: 0, y: 6 });
      state.setElementProfile(`${M}/az`, { status: S.optional });
      expect(svc.fortschritt()).toEqual({ x: 1, y: 6 });
      expect(svc.istEntschieden(`${M}/az`)).toBeTrue();
    });

    it('Wirkung markierung ("zu klaeren") zaehlt als offen', () => {
      state.setElementProfile(`${M}/az`, { status: S.markierung });
      expect(svc.istEntschieden(`${M}/az`)).toBeFalse();
      expect(svc.offeneSet().has(`${M}/az`)).toBeTrue();
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
      expect(svc.fortschritt()).toEqual({ x: 1, y: 4 });
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

    it('Punkte: Pflicht-Blaetter als Wert-Punkte, keine Zweig-Punkte, kein Abstieg in Unentschiedenes', () => {
      expect(pfade()).toEqual([
        `${M}/kopf`, // Pflicht-Blatt → Wert noetig
        `${M}/az`,
        `${M}/_auswahl`,
        `${M}/beteiligung`,
        `${M}/_gruppe`,
      ]);
      const arten = Object.fromEntries(svc.punkte().map((p) => [p.path, p.art]));
      expect(arten[`${M}/kopf`]).toBe('wert');
      expect(arten[`${M}/az`]).toBe('element');
      expect(arten[`${M}/_auswahl`]).toBe('auswahl');
      // Zweige und Pflicht-Kinder nicht aufgenommener Gruppen sind keine Punkte.
      expect(pfade()).not.toContain(`${M}/_auswahl/email`);
      expect(pfade()).not.toContain(`${M}/_gruppe/detail`);
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

    it('aufnehmen steigt ab (neue Punkte), weglassen entscheidet ohne Abstieg', () => {
      const y0 = svc.fortschritt().y;
      svc.setzeAufnahme(`${M}/_gruppe`, true);
      expect(pfade()).toContain(`${M}/_gruppe/detail`); // Pflicht-Blatt der Gruppe
      expect(svc.fortschritt().y).toBe(y0 + 1);
      svc.setzeAufnahme(`${M}/_gruppe`, false);
      expect(pfade()).not.toContain(`${M}/_gruppe/detail`);
      expect(svc.offeneSet().has(`${M}/_gruppe`)).toBeFalse(); // weggelassen = entschieden
      svc.setzeAufnahme(`${M}/_gruppe`, null);
      expect(svc.offeneSet().has(`${M}/_gruppe`)).toBeTrue(); // zurueckgenommen = offen
    });

    it('aufgenommenes optionales Blatt ist erst mit Wert entschieden', () => {
      svc.setzeAufnahme(`${M}/az`, true);
      expect(svc.offeneSet().has(`${M}/az`)).toBeTrue();
      expect(svc.offenePflicht()).toBe(3); // kopf, _auswahl + aufgenommenes Blatt ohne Wert
      state.setElementProfile(`${M}/az`, { beispiel: '12 C 34/26' });
      expect(svc.offeneSet().has(`${M}/az`)).toBeFalse();
    });

    it('Vorkommen (Auspraegungen) zaehlen; ihre Pflicht-Blaetter sind Wert-Punkte', () => {
      svc.setzeAufnahme(`${M}/beteiligung`, true);
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
});
