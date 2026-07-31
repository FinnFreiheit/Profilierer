import { TestBed } from '@angular/core/testing';
import { ValueService } from './value.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { CodelistInfo, EnumWert } from '../../models/codelist.model';

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
