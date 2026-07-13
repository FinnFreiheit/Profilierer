import { TestBed } from '@angular/core/testing';
import { CodelistService } from './codelist.service';
import { StateService } from './state.service';

const GC = `<?xml version="1.0" encoding="UTF-8"?>
<gc:CodeList xmlns:gc="http://docs.oasis-open.org/codelist/ns/genericode/1.0/">
  <Identification>
    <ShortName>Teststaaten</ShortName>
    <CanonicalUri>urn:test:staaten</CanonicalUri>
    <CanonicalVersionUri>urn:test:staaten_2</CanonicalVersionUri>
  </Identification>
  <ColumnSet>
    <Column Id="code"><ShortName>Code</ShortName></Column>
    <Column Id="wert"><ShortName>Wert</ShortName></Column>
  </ColumnSet>
  <SimpleCodeList>
    <Row>
      <Value ColumnRef="code"><SimpleValue>DE</SimpleValue></Value>
      <Value ColumnRef="wert"><SimpleValue>Deutschland</SimpleValue></Value>
    </Row>
    <Row>
      <Value ColumnRef="code"><SimpleValue>FR</SimpleValue></Value>
      <Value ColumnRef="wert"><SimpleValue>Frankreich</SimpleValue></Value>
    </Row>
  </SimpleCodeList>
</gc:CodeList>`;

describe('CodelistService', () => {
  let svc: CodelistService;
  let state: StateService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    localStorage.removeItem('xjp.clcache');
    svc = TestBed.inject(CodelistService);
    state = TestBed.inject(StateService);
  });

  it('parseGenericode liest Kennung, Version und Werte', () => {
    const dom = new DOMParser().parseFromString(GC, 'application/xml');
    const cl = svc.parseGenericode(dom);
    expect(cl).not.toBeNull();
    expect(cl!.kennung).toBe('urn:test:staaten');
    expect(cl!.version).toBe('2');
    expect(cl!.name).toBe('Teststaaten');
    expect(cl!.werte).toEqual([
      { value: 'DE', label: 'Deutschland' },
      { value: 'FR', label: 'Frankreich' },
    ]);
  });

  it('mergeCodelist behaelt die neuere Version', () => {
    svc.mergeCodelist({ kennung: 'k', version: '2', werte: [{ value: 'A', label: 'a' }] });
    svc.mergeCodelist({ kennung: 'k', version: '1', werte: [{ value: 'X', label: 'x' }] });
    expect(state.codelists()['k']!.version).toBe('2');
    svc.mergeCodelist({ kennung: 'k', version: '3', werte: [{ value: 'Z', label: 'z' }] });
    expect(state.codelists()['k']!.version).toBe('3');
  });

  it('ensureUsedCodelists ueberspringt den Netzabruf, wenn schon Listen vorhanden sind', async () => {
    state.idx.set({} as never);
    const spy = spyOn(svc, 'loadFromXRepository').and.resolveTo();
    svc.mergeCodelist({ kennung: 'k', version: '1', werte: [{ value: 'A', label: 'a' }] });
    await svc.ensureUsedCodelists();
    expect(spy).not.toHaveBeenCalled();
  });

  it('ensureUsedCodelists laedt hoechstens einmal pro Standard-Version', async () => {
    state.idx.set({} as never);
    const spy = spyOn(svc, 'loadFromXRepository').and.resolveTo();
    await svc.ensureUsedCodelists();
    await svc.ensureUsedCodelists();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
