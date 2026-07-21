import { TestBed } from '@angular/core/testing';
import { XmlValidationService } from './xml-validation.service';
import { StateService } from './state.service';

/** Mini-Schema mit einer Pflicht-Sequenz — reicht fuer valide/invalide Faelle. */
const MINI_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="urn:test" xmlns="urn:test" elementFormDefault="qualified">
  <xs:element name="nachricht.test.fall.0000001">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="kopf" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

const VALIDE = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.test.fall.0000001 xmlns="urn:test"><kopf>x</kopf></nachricht.test.fall.0000001>`;

const INVALIDE = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.test.fall.0000001 xmlns="urn:test"><falsch>x</falsch></nachricht.test.fall.0000001>`;

describe('XmlValidationService', () => {
  let service: XmlValidationService;
  let state: StateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(XmlValidationService);
    state = TestBed.inject(StateService);
    const dom = new DOMParser().parseFromString(MINI_XSD, 'application/xml');
    state.docs.set([{ file: 'mini.xsd', dom }]);
  });

  it('meldet eine schema-konforme Instanz als valide', async () => {
    const r = await service.validiere(VALIDE);
    expect(r.status).toBe('valide');
    expect(r.fehler).toEqual([]);
  });

  it('meldet Schemaverstoesse als invalide mit Fehlerliste', async () => {
    const r = await service.validiere(INVALIDE);
    expect(r.status).toBe('invalide');
    expect(r.fehler.length).toBeGreaterThan(0);
    expect(r.fehler[0]).toContain('falsch');
  });

  it('lehnt Nicht-XJustiz-XML als invalide ab', async () => {
    const r = await service.validiere('<foo/>');
    expect(r.status).toBe('invalide');
  });

  it('ist unpruefbar, wenn kein Schema zur Version verfuegbar ist', async () => {
    state.docs.set([]);
    const fremd = `<nachricht.test.fall.0000001 xmlns="urn:test" xjustizVersion="9.9.9"/>`;
    const r = await service.validiere(fremd);
    expect(r.status).toBe('unpruefbar');
    expect(r.fehler.length).toBe(1);
  });
});
