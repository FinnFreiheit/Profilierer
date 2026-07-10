import { TestBed } from '@angular/core/testing';
import { PersistenceService } from './persistence.service';
import { StateService } from './state.service';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

describe('PersistenceService.loadXsdFiles', () => {
  let svc: PersistenceService;
  let state: StateService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(PersistenceService);
    state = TestBed.inject(StateService);
  });

  it('parst .xsd-Dateien, baut den Index und setzt den Store', async () => {
    const file = new File([XSD], 'xjustiz_0000_test.xsd', { type: 'application/xml' });
    const n = await svc.loadXsdFiles([file]);
    expect(n).toBe(1);
    expect(state.version()).toBe('3.6.2');
    expect(state.idx()!.messages.map((m) => m.name)).toEqual(['nachricht.test.0001']);
    expect(state.docs().length).toBe(1);
  });

  it('wirft bei fehlenden .xsd-Dateien', async () => {
    const other = new File(['x'], 'liste.xml', { type: 'text/xml' });
    await expectAsync(svc.loadXsdFiles([other])).toBeRejectedWithError(/Keine .xsd/);
  });
});
