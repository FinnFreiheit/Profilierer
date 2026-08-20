import { TestBed } from '@angular/core/testing';
import { UeberlagerungService } from './ueberlagerung.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { CodelistService } from './codelist.service';
import { ProfileStoreService } from './profile-store.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { XsdDoc } from '../../models/xsd-index.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="nachrichtenkopf" type="Type.Test.Kopf"/>
    <xs:element name="vorname" type="xs:string"/>
    <xs:element name="ort" type="xs:string" minOccurs="0"/>
    <xs:element name="beteiligung" type="Type.Test.Bet" minOccurs="0" maxOccurs="unbounded"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Kopf"><xs:sequence>
    <xs:element name="erstellungszeitpunkt" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Bet"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0001';

/** Eine Nachricht: ein Beteiligter „A", Ort gesetzt. */
const A = `<nachricht.test.0001 xmlns="http://www.xjustiz.de">
  <nachrichtenkopf><erstellungszeitpunkt>2026-08-20T09:00:00</erstellungszeitpunkt></nachrichtenkopf>
  <vorname>Max</vorname>
  <ort>Kiel</ort>
  <beteiligung><name>A</name></beteiligung>
</nachricht.test.0001>`;

/** Zwei Beteiligte, anderer Vorname, kein Ort, anderer Zeitstempel. */
const B = `<nachricht.test.0001 xmlns="http://www.xjustiz.de">
  <nachrichtenkopf><erstellungszeitpunkt>2026-08-20T10:00:00</erstellungszeitpunkt></nachrichtenkopf>
  <vorname>Erika</vorname>
  <beteiligung><name>A</name></beteiligung>
  <beteiligung><name>B</name></beteiligung>
</nachricht.test.0001>`;

/** Wie A, nur ein weiterer Vorname — für die Mehrheits-/Referenzregel. */
const C = `<nachricht.test.0001 xmlns="http://www.xjustiz.de">
  <nachrichtenkopf><erstellungszeitpunkt>2026-08-20T11:00:00</erstellungszeitpunkt></nachrichtenkopf>
  <vorname>Max</vorname>
  <ort>Kiel</ort>
  <beteiligung><name>A</name></beteiligung>
</nachricht.test.0001>`;

/**
 * Nachrichten-Ueberlagerung (#147): alle Testnachrichten eines Szenarios im
 * selben Baum. Geprueft wird die Zuordnung — welcher Wert unter welchem Blatt
 * landet, wenn die Nachrichten verschieden viele Vorkommen haben — und die
 * Lesart der Kaesten (Abweichung, fehlende Angabe, technische Kopfangabe).
 */
describe('UeberlagerungService', () => {
  let svc: UeberlagerungService;
  let state: StateService;

  const quellen = [
    { id: 'a', name: 'Eine Beteiligung', xml: A },
    { id: 'b', name: 'Zwei Beteiligungen', xml: B },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // Kein Netz im Test: Codelisten-Vorabruf und Stores stillstellen.
        { provide: CodelistService, useValue: { ensureUsedCodelists: () => Promise.resolve() } },
        { provide: ProfileStoreService, useValue: { entries: () => [] } },
        {
          provide: TestmessageStoreService,
          useValue: { entries: () => [], loadXml: async () => null },
        },
      ],
    });
    svc = TestBed.inject(UeberlagerungService);
    state = TestBed.inject(StateService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    state.idx.set(parser.buildIndexFrom(docs).idx);
  });

  /** Der Baumpfad des n-ten Vorkommens der Vereinigung. */
  const bet = (n: number): string => {
    const ausps = state.auspsOf(`${M}/beteiligung`)!;
    return `${M}/beteiligung@${ausps[n - 1]!.id}`;
  };

  it('öffnet den Baum der Nachricht betrachtend, ohne Profilierung', () => {
    svc.baue(quellen, 'Szenario');
    expect(state.msgName()).toBe(M);
    expect(state.readOnly()).toBeTrue();
    expect(state.schemaView()).toBeTrue();
    expect(state.activeProfileId()).toBeNull();
    // Die Werte stehen in der Ueberlagerung, nicht im Profil.
    expect(state.elemente()).toEqual({});
    expect(svc.aktiv()).toBeTrue();
  });

  it('führt die Vorkommen als Vereinigung — so viele wie die längste Nachricht', () => {
    svc.baue(quellen, 'Szenario');
    expect(state.auspsOf(`${M}/beteiligung`)!.map((a) => a.name)).toEqual([
      'Vorkommen 1',
      'Vorkommen 2',
    ]);
  });

  it('ordnet die Werte positionsweise zu', () => {
    svc.baue(quellen, 'Szenario');
    expect(svc.blaetter(`${bet(1)}/name`).map((w) => w.wert)).toEqual(['A', 'A']);
    // Die Nachricht mit einem Beteiligten hat an der zweiten Stelle nichts.
    expect(svc.blaetter(`${bet(2)}/name`).map((w) => w.wert)).toEqual([null, 'B']);
  });

  it('gibt je gewählter Nachricht einen Kasten mit ihrer Farbe', () => {
    svc.baue(quellen, 'Szenario');
    const blaetter = svc.blaetter(`${M}/vorname`);
    expect(blaetter.map((w) => w.name)).toEqual(['Eine Beteiligung', 'Zwei Beteiligungen']);
    expect(new Set(blaetter.map((w) => w.farbe)).size).toBe(2);
  });

  it('lässt Blätter ohne jeden Wert leer — kein Kasten ohne Aussage', () => {
    svc.baue(quellen, 'Szenario');
    expect(svc.blaetter(`${M}/nachrichtenkopf`)).toEqual([]);
  });

  it('markiert die Abweichung gegen den häufigsten Wert', () => {
    svc.baue([...quellen, { id: 'c', name: 'Dritte', xml: C }], 'Szenario');
    const namen = svc.blaetter(`${M}/vorname`);
    // Zweimal "Max", einmal "Erika" — die Ausnahme sticht heraus, nicht beide.
    expect(namen.map((w) => w.abweichend)).toEqual([false, true, false]);
  });

  it('wertet die fehlende Angabe als Abweichung', () => {
    svc.baue(quellen, 'Szenario');
    const orte = svc.blaetter(`${M}/ort`);
    expect(orte.map((w) => w.wert)).toEqual(['Kiel', null]);
    expect(orte.map((w) => w.abweichend)).toEqual([false, true]);
  });

  it('lässt technische Kopfangaben nicht als Abweichung gelten', () => {
    svc.baue(quellen, 'Szenario');
    const pfad = `${M}/nachrichtenkopf/erstellungszeitpunkt`;
    expect(svc.blaetter(pfad).map((w) => w.abweichend)).toEqual([false, false]);
    expect(svc.bilanz(pfad)!.abweichend).toBeFalse();
  });

  it('bilanziert am Blatt: belegte Nachrichten und verschiedene Werte', () => {
    svc.baue(quellen, 'Szenario');
    expect(svc.bilanz(`${M}/ort`)).toEqual({
      belegt: 1,
      gesamt: 2,
      verschieden: 1,
      abweichend: true,
      sagend: true,
    });
    expect(svc.bilanz(`${M}/vorname`)!.verschieden).toBe(2);
  });

  it('hält die Bilanz zurück, wo sie nichts sagt', () => {
    svc.baue(quellen, 'Szenario');
    // Alle belegt, alle gleich — „2×" wäre eine Zahl ohne Aussage.
    expect(svc.bilanz(`${bet(1)}/name`)!.sagend).toBeFalse();
    expect(svc.bilanz(`${M}/vorname`)!.sagend).toBeTrue();
  });

  it('markiert ohne Mehrheit beide Seiten — eine Reihenfolge ist keine Aussage', () => {
    svc.baue(quellen, 'Szenario');
    // Zwei Nachrichten, zwei Werte: keine ist der Maßstab.
    expect(svc.blaetter(`${M}/vorname`).map((w) => w.abweichend)).toEqual([true, true]);
  });

  it('nummeriert die Nachrichten für die Kästen durch', () => {
    svc.baue(quellen, 'Szenario');
    expect(svc.nachrichten().map((n) => n.kuerzel)).toEqual(['N1', 'N2']);
    expect(svc.blaetter(`${M}/vorname`).map((w) => w.kuerzel)).toEqual(['N1', 'N2']);
  });

  it('zählt die Abweichungen an den Vorfahren — der Wegweiser im zugeklappten Ast', () => {
    svc.baue(quellen, 'Szenario');
    // vorname, ort und der Name des zweiten Vorkommens hängen unter der Wurzel.
    expect(svc.abweichungenDarunter(M)).toBe(3);
    expect(svc.abweichungenDarunter(`${M}/beteiligung`)).toBe(1);
    expect(svc.abweichungenDarunter(`${M}/nachrichtenkopf`)).toBe(0);
  });

  it('richtet die Blätter aus und gibt die Einstellung beim Beenden zurück', () => {
    expect(state.alignLeaves()).toBeFalse();
    svc.baue(quellen, 'Szenario');
    expect(state.alignLeaves()).toBeTrue();
    svc.beende();
    expect(state.alignLeaves()).toBeFalse();
  });

  it('nimmt abgewählte Nachrichten aus Kästen und Vergleich', () => {
    svc.baue(quellen, 'Szenario');
    svc.schalte('b');
    expect(svc.blaetter(`${M}/vorname`).map((w) => w.name)).toEqual(['Eine Beteiligung']);
    // Mit nur einer Nachricht gibt es nichts, wovon abgewichen werden könnte.
    expect(svc.blaetter(`${M}/ort`)[0]!.abweichend).toBeFalse();
    expect(svc.abweichungen()).toBe(0);
  });

  it('verdeckt mit „nur Abweichungen" die übereinstimmenden Äste', () => {
    svc.baue(quellen, 'Szenario');
    const gleich = `${bet(1)}/name`; // beide sagen "A"
    expect(svc.verdeckt(gleich)).toBeFalse();
    svc.nurAbweichungen.set(true);
    expect(svc.verdeckt(gleich)).toBeTrue();
    expect(svc.verdeckt(`${M}/vorname`)).toBeFalse();
    // Der Weg dorthin bleibt offen, sonst wäre der Unterschied unerreichbar.
    expect(svc.verdeckt(`${M}/beteiligung`)).toBeFalse();
    expect(svc.verdeckt(bet(2))).toBeFalse();
  });

  it('zählt die Abweichungen ohne die technischen Kopfangaben', () => {
    svc.baue(quellen, 'Szenario');
    // vorname, ort und der Name des zweiten Vorkommens — nicht der Zeitstempel.
    expect(svc.abweichungen()).toBe(3);
  });

  it('klappt die belegten Äste auf', () => {
    svc.baue(quellen, 'Szenario');
    expect(state.isOpen(M)).toBeTrue();
    expect(state.isOpen(`${M}/beteiligung`)).toBeTrue();
    expect(state.isOpen(bet(2))).toBeTrue();
  });

  it('endet mit dem Wechsel der Nachricht', () => {
    svc.baue(quellen, 'Szenario');
    TestBed.tick();
    state.msgName.set('nachricht.test.9999');
    TestBed.tick();
    expect(svc.aktiv()).toBeFalse();
    expect(svc.blaetter(`${M}/vorname`)).toEqual([]);
  });

  it('verlangt mindestens zwei Nachrichten', () => {
    expect(() => svc.baue([quellen[0]!], 'Szenario')).toThrowError(/mindestens zwei/);
  });

  it('weist gemischte Nachrichtentypen ab', () => {
    const fremd = {
      id: 'x',
      name: 'Andere Nachricht',
      xml: `<nachricht.test.0002 xmlns="http://www.xjustiz.de"><vorname>Y</vorname></nachricht.test.0002>`,
    };
    expect(() => svc.baue([quellen[0]!, fremd], 'Szenario')).toThrowError(
      /auswertbar|Nachrichtentyp/,
    );
  });
});
