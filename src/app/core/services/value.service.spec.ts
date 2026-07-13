import { TestBed } from '@angular/core/testing';
import { ValueService } from './value.service';
import { StateService } from './state.service';
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
