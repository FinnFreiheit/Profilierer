import { TestBed } from '@angular/core/testing';
import { ValueService } from './value.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { CodelistInfo } from '../../models/codelist.model';

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

  const leaf = (name: string, typeName: string) => ({ name, path: 'm/' + name, typeName, codelist: null });

  it('Type.GDS.Datumsangabe bekommt ein pattern-konformes Datum', () => {
    expect(svc.placeholderFor(leaf('geburtsdatum', 'Type.GDS.Datumsangabe'))).toBe('2026-01-01');
  });

  it('UUID-Typ bekommt einen pattern-konformen Wert', () => {
    const v = svc.placeholderFor(leaf('uuid', 'Type.GDS.Xdomea.stringUUIDType'));
    expect(/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(v)).toBeTrue();
  });

  it('double und duration sind als Builtins abgedeckt', () => {
    expect(svc.placeholderFor(leaf('betrag', 'double'))).toBe('0.0');
    expect(svc.placeholderFor(leaf('dauer', 'duration'))).toBe('P1D');
  });

  it('ein gespeicherter Beispielwert hat weiter Vorrang vor dem Platzhalter', () => {
    state.setElementProfile('m/geburtsdatum', { beispiel: '1980-05-12' });
    expect(svc.placeholderFor(leaf('geburtsdatum', 'Type.GDS.Datumsangabe'))).toBe('1980-05-12');
  });
});
