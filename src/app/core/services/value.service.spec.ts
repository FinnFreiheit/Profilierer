import { TestBed } from '@angular/core/testing';
import { ValueService } from './value.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { CodelistInfo, EnumWert } from '../../models/codelist.model';
import { ElementProfile } from '../../models/profile.model';

describe('ValueService.labelFor', () => {
  let svc: ValueService;
  let state: StateService;

  const extern: CodelistInfo = {
    typeName: 'Code.Test',
    nameLang: 'Teststaaten',
    kennung: 'urn:test:staaten',
    beschreibung: '',
    werte: null, // extern gepflegt → aus state.codelists aufloesen
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValueService);
    state = TestBed.inject(StateService);
  });

  it('loest einen belegten Code aus der geladenen Codeliste auf', () => {
    state.codelists.set({
      'urn:test:staaten': {
        kennung: 'urn:test:staaten',
        version: '2',
        werte: [
          { value: 'DE', label: 'Deutschland' },
          { value: 'FR', label: 'Frankreich' },
        ],
      },
    });
    expect(svc.labelFor(extern, 'DE')).toBe('Deutschland');
    expect(svc.labelFor(extern, 'FR')).toBe('Frankreich');
  });

  it('liefert null, wenn Liste fehlt, Code unbekannt oder kein Code uebergeben', () => {
    expect(svc.labelFor(extern, 'DE')).toBeNull(); // nichts geladen
    state.codelists.set({
      'urn:test:staaten': {
        kennung: 'urn:test:staaten',
        version: '2',
        werte: [{ value: 'DE', label: 'Deutschland' }],
      },
    });
    expect(svc.labelFor(extern, 'ZZ')).toBeNull(); // unbekannter Code
    expect(svc.labelFor(extern, '')).toBeNull();
    expect(svc.labelFor(null, 'DE')).toBeNull();
  });

  it('nutzt inline gepflegte Werte (Code-Typ 1/2) direkt', () => {
    const inline: CodelistInfo = {
      typeName: 'Code.Inline',
      nameLang: 'Inline',
      kennung: 'urn:test:inline',
      beschreibung: '',
      werte: [{ value: 'A', label: 'Anlage' }],
    };
    expect(svc.labelFor(inline, 'A')).toBe('Anlage');
  });
});

describe('ValueService.placeholderFor', () => {
  let svc: ValueService;
  let state: StateService;

  // Originalgetreue Typ-Kette aus dem Grunddatensatz 3.6.2: Datumsangabe ist
  // eine Pattern-Restriktion auf den DIN-91379-Datentyp C (Basis xs:string).
  const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:tns="http://www.xjustiz.de"
           xmlns:din91379="urn:xoev-de:kosit:xoev:datentyp:din-91379_2022-08"
           targetNamespace="http://www.xjustiz.de" version="3.6.2">
   <xs:simpleType name="Type.GDS.Datumsangabe">
      <xs:restriction base="din91379:datatypeC">
         <xs:pattern value="\\d{4}((-\\d{2}){0,1}-\\d{2}){0,1}"/>
      </xs:restriction>
   </xs:simpleType>
   <xs:simpleType name="datatypeC">
      <xs:restriction base="xs:string">
         <xs:pattern value="([\\t-~]|[¡-£])*"/>
      </xs:restriction>
   </xs:simpleType>
   <xs:simpleType name="Type.GDS.Xdomea.stringUUIDType">
      <xs:restriction base="xs:string">
         <xs:pattern value="[0-9|A-F|a-f]{8}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{12}"/>
      </xs:restriction>
   </xs:simpleType>
</xs:schema>`;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValueService);
    state = TestBed.inject(StateService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    state.idx.set(parser.buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx);
  });

  const leaf = (name: string, typeName: string) => ({
    name,
    path: 'm/' + name,
    typeName,
    codelist: null,
  });

  it('Type.GDS.Datumsangabe bekommt ein pattern-konformes Datum', () => {
    expect(svc.placeholderFor(leaf('geburtsdatum', 'Type.GDS.Datumsangabe'))).toBe('2026-01-01');
  });

  it('UUID-Typ bekommt einen pattern-konformen Wert', () => {
    const v = svc.placeholderFor(leaf('uuid', 'Type.GDS.Xdomea.stringUUIDType'));
    expect(
      /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(v),
    ).toBeTrue();
  });

  it('double und duration sind als Builtins abgedeckt', () => {
    expect(svc.placeholderFor(leaf('betrag', 'double'))).toBe('0.0');
    expect(svc.placeholderFor(leaf('dauer', 'duration'))).toBe('P1D');
  });

  it('ein gespeicherter Beispielwert hat weiter Vorrang vor dem Platzhalter', () => {
    state.setElementProfile('m/geburtsdatum', { beispiel: '1980-05-12' });
    expect(svc.placeholderFor(leaf('geburtsdatum', 'Type.GDS.Datumsangabe'))).toBe('1980-05-12');
  });

  describe('wertProblem', () => {
    it('meldet typwidrige Datumsformate (deutsches Format statt ISO)', () => {
      const problem = svc.wertProblem(leaf('geburtsdatum', 'Type.GDS.Datumsangabe'), '18.08.72');
      expect(problem).toContain('Type.GDS.Datumsangabe');
      expect(problem).toContain('2026-01-01');
    });

    it('akzeptiert pattern-konforme Werte inkl. Teildatum (yyyy, yyyy-mm)', () => {
      for (const w of ['1972-08-18', '1972-08', '1972']) {
        expect(svc.wertProblem(leaf('geburtsdatum', 'Type.GDS.Datumsangabe'), w)).toBeNull();
      }
    });

    it('prueft Builtin-Formate (xs:date, xs:int, xs:boolean)', () => {
      expect(svc.wertProblem(leaf('datum', 'date'), '18.08.1972')).toContain('xs:date');
      expect(svc.wertProblem(leaf('datum', 'date'), '1972-08-18')).toBeNull();
      expect(svc.wertProblem(leaf('anzahl', 'int'), 'drei')).toContain('xs:int');
      expect(svc.wertProblem(leaf('anzahl', 'int'), '3')).toBeNull();
      expect(svc.wertProblem(leaf('flag', 'boolean'), 'ja')).toContain('xs:boolean');
      expect(svc.wertProblem(leaf('flag', 'boolean'), 'true')).toBeNull();
    });

    it('prueft Codelisten-Werte gegen die geladene Liste', () => {
      const cl: CodelistInfo = {
        typeName: 'Code.Test',
        nameLang: 'Teststaaten',
        kennung: 'urn:test:staaten',
        beschreibung: '',
        werte: [{ value: 'DE', label: 'Deutschland' }],
      };
      const node = { name: 'staat', path: 'm/staat', typeName: 'Code.Test', codelist: cl };
      expect(svc.wertProblem(node, 'DE')).toBeNull();
      expect(svc.wertProblem(node, 'XX')).toContain('kein Wert der Codeliste');
    });

    it('leere Werte und unbekannte Typen sind kein Problem', () => {
      expect(svc.wertProblem(leaf('geburtsdatum', 'Type.GDS.Datumsangabe'), '')).toBeNull();
      expect(svc.wertProblem(leaf('freitext', 'Type.Unbekannt'), 'irgendwas')).toBeNull();
    });
  });
});

describe('ValueService.vorschlagFor', () => {
  let svc: ValueService;
  let state: StateService;

  /** Vorgabe-Dokument mit eigener Stufenliste (Stufen sind je Profilierung frei). */
  const bindeVorgabe = (elemente: Record<string, ElementProfile>): void => {
    state.setVorgabe({
      meta: {},
      statuses: [{ id: 'w1', name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' }],
      elemente,
      auspraegungen: {},
      erweiterungen: {},
    });
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValueService);
    state = TestBed.inject(StateService);
  });

  it('schlaegt den Beispielwert der gebundenen Fassung vor', () => {
    bindeVorgabe({ 'm/az': { beispiel: '1 C 234/25' } });
    expect(svc.vorschlagFor('m/az')).toBe('1 C 234/25');
    expect(svc.vorschlagFor('m/ohne')).toBeNull();
  });

  it('ohne gebundene Fassung gibt es keinen Vorschlag', () => {
    state.setElementProfile('m/az', { beispiel: 'im Durchlauf eingetragen' });
    expect(svc.vorschlagFor('m/az')).toBeNull();
  });

  it('schlaegt eine auf genau einen Wert eingeschraenkte Codeliste vor', () => {
    bindeVorgabe({ 'm/rolle': { werte: ['01'] } });
    expect(svc.vorschlagFor('m/rolle')).toBe('01');
  });

  it('nimmt aus einem manuell gepflegten Eintrag nur den Code', () => {
    bindeVorgabe({ 'm/rolle': { werte: ['2001 — Genehmigung Grundstücksgeschäft'] } });
    expect(svc.vorschlagFor('m/rolle')).toBe('2001');
  });

  it('schlaegt nichts vor, wo mehrere Werte zur Wahl stehen oder keiner zugelassen ist', () => {
    bindeVorgabe({ 'm/rolle': { werte: ['01', '02'] }, 'm/art': { werte: [] } });
    expect(svc.vorschlagFor('m/rolle')).toBeNull();
    expect(svc.vorschlagFor('m/art')).toBeNull();
  });

  it('gilt auch im Vorkommen — dort kennt die Profilierung nur den generischen Pfad', () => {
    bindeVorgabe({ 'm/bet/rolle': { beispiel: '01' } });
    expect(svc.vorschlagFor('m/bet@a1/rolle')).toBe('01');
  });

  // ── Wuerfel und Sammelbefuellung im gebundenen Durchlauf ──────────────

  const rolle: CodelistInfo = {
    typeName: 'Code.Rolle',
    nameLang: 'Rollenbezeichnung',
    kennung: 'urn:test:rolle',
    beschreibung: '',
    werte: [
      { value: '01', label: 'Notar/in' },
      { value: '02', label: 'Betroffene Person' },
      { value: '03', label: 'Beteiligte/r' },
    ],
  };

  it('der Beispielwert der Profilierung hat Vorrang vor einem Zufallswert', () => {
    bindeVorgabe({ 'm/datum': { beispiel: '2024-03-01' } });
    expect(svc.dummyFor({ name: 'datum', path: 'm/datum', typeName: 'date', codelist: null })).toBe(
      '2024-03-01',
    );
  });

  it('wuerfelt nur freigegebene Codelisten-Werte — den ersten, nicht irgendeinen', () => {
    bindeVorgabe({ 'm/rolle': { werte: ['02', '03'] } });
    const wert = svc.dummyFor({
      name: 'rolle',
      path: 'm/rolle',
      typeName: 'Code.Rolle',
      codelist: rolle,
    });
    // `dummyFor` ist deterministisch: der erste freigegebene Eintrag. Eine
    // Zusicherung gegen beide Kandidaten liesse auch eine Zufallsauswahl durch
    // und damit ausgerechnet die Eigenschaft offen, auf die es hier ankommt.
    expect(wert).toBe('02');
  });

  it('wuerfelt den Code, auch wenn der Eintrag Code und Beschreibung traegt', () => {
    // Freigegebene Eintraege duerfen aus dem Freitextfeld stammen.
    bindeVorgabe({ 'm/rolle': { werte: ['03 — Zeuge/Zeugin'] } });
    expect(
      svc.dummyFor({ name: 'rolle', path: 'm/rolle', typeName: 'Code.Rolle', codelist: rolle }),
    ).toBe('03');
  });

  it('die Verweisnummer geht dem Vorschlag vor — sie muss an beiden Enden stimmen', () => {
    const id = state.addAusp('m/bet', 'Notar/in');
    state.setElementProfile('m/verweis', { refZiel: 'm/bet@' + id });
    bindeVorgabe({ 'm/verweis/ref.rollennummer': { beispiel: '99' } });

    expect(
      svc.dummyFor({
        name: 'ref.rollennummer',
        path: 'm/verweis/ref.rollennummer',
        typeName: 'string',
        codelist: null,
      }),
    ).toBe('1');
  });

  it('ohne Bindung wuerfelt der Wuerfel weiter typgerecht, nicht den eigenen Wert', () => {
    state.setElementProfile('m/datum', { beispiel: '1999-12-31' });
    expect(svc.dummyFor({ name: 'datum', path: 'm/datum', typeName: 'date', codelist: null })).toBe(
      '2026-01-01',
    );
  });
});

describe('ValueService.werteVerstoss', () => {
  let svc: ValueService;
  let state: StateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValueService);
    state = TestBed.inject(StateService);
  });

  it('meldet einen Wert ausserhalb der freigegebenen Codes', () => {
    state.setElementProfile('m/rolle', { werte: ['01', '02'] });
    expect(svc.werteVerstoss('m/rolle', '03')).toContain('03');
  });

  it('laesst freigegebene Werte durch — auch aus manuell gepflegten Eintraegen', () => {
    state.setElementProfile('m/rolle', { werte: ['01', '2001 — Genehmigung'] });
    expect(svc.werteVerstoss('m/rolle', '01')).toBeNull();
    expect(svc.werteVerstoss('m/rolle', '2001')).toBeNull();
  });

  it('ohne Einschraenkung und ohne Wert gibt es keinen Verstoss', () => {
    expect(svc.werteVerstoss('m/rolle', '03')).toBeNull();
    state.setElementProfile('m/rolle', { werte: ['01'] });
    expect(svc.werteVerstoss('m/rolle', '  ')).toBeNull();
  });
});

describe('ValueService.werteZeilen', () => {
  let svc: ValueService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValueService);
  });

  it('zerlegt freigegebene Eintraege in Code und Beschreibung', () => {
    expect(svc.werteZeilen(['2001 — Genehmigung Grundstücksgeschäft', '01'])).toEqual([
      { value: '2001', label: 'Genehmigung Grundstücksgeschäft' },
      { value: '01', label: '' },
    ]);
  });
});

describe('ValueService.sichtbareWerte', () => {
  let svc: ValueService;

  const alle: EnumWert[] = [
    { value: 'A', label: 'Anlage' },
    { value: 'B', label: 'Beschluss' },
    { value: 'C', label: 'Cessio' },
  ];

  const codes = (ws: EnumWert[]): string[] => ws.map((w) => w.value);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValueService);
  });

  it('ohne Einschraenkung bleibt die vollstaendige Liste ohne Umschalter', () => {
    const s = svc.sichtbareWerte(alle, undefined, false, 'profil');
    expect(codes(s.sichtbar)).toEqual(['A', 'B', 'C']);
    expect(s.umschalter).toBeFalse();
    expect(s.gefiltert).toBeFalse();
  });

  it('Teilmenge: im Profil-Modus nur die zugelassenen Werte, Umschalter dabei', () => {
    const s = svc.sichtbareWerte(alle, ['A', 'C'], false, 'profil');
    expect(codes(s.sichtbar)).toEqual(['A', 'C']);
    expect(s.umschalter).toBeTrue();
    expect(s.gefiltert).toBeTrue();
  });

  it('Umschalter „alle zeigen" holt die vollstaendige Liste zurueck', () => {
    const s = svc.sichtbareWerte(alle, ['A'], true, 'profil');
    expect(codes(s.sichtbar)).toEqual(['A', 'B', 'C']);
    expect(s.umschalter).toBeTrue();
    expect(s.gefiltert).toBeFalse();
  });

  it('Nachrichten-Modus filtert unbedingt und ohne Umschalter', () => {
    for (const alleZeigen of [false, true]) {
      const s = svc.sichtbareWerte(alle, ['B'], alleZeigen, 'nachricht');
      expect(codes(s.sichtbar)).toEqual(['B']);
      expect(s.umschalter).toBeFalse();
      expect(s.gefiltert).toBeTrue();
    }
  });

  it('Nur-Lesen filtert mit Umschalter', () => {
    const zu = svc.sichtbareWerte(alle, ['B'], false, 'lesen');
    expect(codes(zu.sichtbar)).toEqual(['B']);
    expect(zu.umschalter).toBeTrue();
    const auf = svc.sichtbareWerte(alle, ['B'], true, 'lesen');
    expect(codes(auf.sichtbar)).toEqual(['A', 'B', 'C']);
  });

  it('„keine" zeigt in Profil- und Lesemodus zwangsweise die volle Liste', () => {
    for (const modus of ['profil', 'lesen'] as const) {
      const s = svc.sichtbareWerte(alle, [], false, modus);
      expect(codes(s.sichtbar)).toEqual(['A', 'B', 'C']);
      expect(s.umschalter).toBeTrue();
      expect(s.gefiltert).toBeFalse();
      expect(s.erzwungen).toBeTrue();
    }
  });

  it('„keine" laesst im Nachrichten-Modus nichts uebrig', () => {
    const s = svc.sichtbareWerte(alle, [], false, 'nachricht');
    expect(s.sichtbar).toEqual([]);
    expect(s.umschalter).toBeFalse();
  });

  it('ohne geladene Werte bleibt die Liste leer', () => {
    const s = svc.sichtbareWerte(null, ['A'], false, 'profil');
    expect(s.sichtbar).toEqual([]);
  });

  it('zugelassene Werte ausserhalb der Liste erzeugen keine Zeilen', () => {
    const s = svc.sichtbareWerte(alle, ['A', 'Z'], false, 'profil');
    expect(codes(s.sichtbar)).toEqual(['A']);
  });
});

describe('ValueService.codesOhneDeckung', () => {
  let svc: ValueService;

  const alle: EnumWert[] = [
    { value: 'A', label: 'Anlage' },
    { value: 'B', label: 'Beschluss' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValueService);
  });

  it('nennt die freigegebenen Codes, die die geladene Liste nicht fuehrt', () => {
    expect(svc.codesOhneDeckung(alle, ['A', 'X', 'Y'])).toEqual(['X', 'Y']);
  });

  it('leer, solange sich Profilierung und Liste decken', () => {
    expect(svc.codesOhneDeckung(alle, ['A', 'B'])).toEqual([]);
  });

  it('vergleicht den reinen Code, auch bei Eintraegen mit Beschreibung', () => {
    expect(svc.codesOhneDeckung(alle, ['A — Anlage'])).toEqual([]);
  });

  it('ohne geladene Liste keine Aussage — dort greift der synthetische Ausweg', () => {
    expect(svc.codesOhneDeckung(null, ['X'])).toEqual([]);
  });

  it('ohne Einschraenkung keine Aussage', () => {
    expect(svc.codesOhneDeckung(alle, null)).toEqual([]);
    expect(svc.codesOhneDeckung(alle, [])).toEqual([]);
  });

  it('alle Codes ohne Deckung — die Sackgasse, die gemeldet werden muss', () => {
    // Kein freigegebener Code in der Liste: die Werteliste zeigt keine Zeile,
    // die freie Eingabe ist gesperrt, der Zaehler sagt weiter "2 von 2".
    expect(svc.codesOhneDeckung(alle, ['X', 'Y']).length).toBe(2);
  });
});

describe('ValueService.naechsterUmschalter', () => {
  let svc: ValueService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValueService);
  });

  it('Elementwechsel setzt auf "nur zugelassene" zurueck', () => {
    expect(svc.naechsterUmschalter(null, false)).toBeFalse();
  });

  it('Elementwechsel auf ein Element mit "keine": Zwang gilt sofort', () => {
    expect(svc.naechsterUmschalter(null, true)).toBeTrue();
  });

  it('"keine" erzwingt "alle zeigen", auch wenn der Umschalter aus war', () => {
    expect(svc.naechsterUmschalter(false, true)).toBeTrue();
  });

  it('faellt der Zwang weg (erster Wert zugelassen), bleibt "alle zeigen" an', () => {
    // Der eigentliche Grund der Funktion: sonst klappte die Liste beim ersten
    // Haken auf die eine zugelassene Zeile zusammen.
    const nachKeine = svc.naechsterUmschalter(false, true);
    expect(svc.naechsterUmschalter(nachKeine, false)).toBeTrue();
  });

  it('ohne Zwang entscheidet der Nutzer — Abwaehlen bleibt wirksam', () => {
    expect(svc.naechsterUmschalter(true, false)).toBeTrue();
    expect(svc.naechsterUmschalter(false, false)).toBeFalse();
  });
});
