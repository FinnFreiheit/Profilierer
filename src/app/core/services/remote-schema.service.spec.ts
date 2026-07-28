import { TestBed } from '@angular/core/testing';
import { RemoteSchemaService } from './remote-schema.service';

/** Ausschnitt der Versionsseite von xjustiz.de (Stand 26.07). */
const SEITE = `<!doctype html><html><body>
  <h2>XJustiz 3.6.2</h2>
  <ul>
    <li><a href="../system/zip/XJustiz_3_6_2_XSD.zip">Schemata 3.6.2</a></li>
    <li><a href="../system/zip/XJustiz_3_6_2_SCH.zip">Schematron 3.6.2</a></li>
    <li><a href="../system/pdf/Spezifikation_XJustiz_3_6_2.pdf">Spezifikation 3.6.2</a></li>
  </ul>
  <h2>XJustiz 4.0.0</h2>
  <ul>
    <li><a href="../system/zip/XJustiz-4_0_0-XSD.zip">Schemata 4.0.0</a></li>
    <li><a href="../system/zip/XJustiz-4_0_0-Schematron.zip">Schematron 4.0.0</a></li>
  </ul>
  <a href="https://www.xrepository.de/details/urn:xoev-de:blk-ag-it-standards:standard:xjustiz_3.5.1">3.5.1</a>
</body></html>`;

describe('RemoteSchemaService', () => {
  let svc: RemoteSchemaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(RemoteSchemaService);
  });

  it('parseVersionsseite: XSD-Pakete je Version, neueste zuerst', () => {
    const vs = svc.parseVersionsseite(SEITE);
    expect(vs.map((v) => v.id)).toEqual(['4.0.0', '3.6.2']);
    expect(vs[0]?.zipUrl).toBe('/system/zip/XJustiz-4_0_0-XSD.zip');
    expect(vs[1]?.zipUrl).toBe('/system/zip/XJustiz_3_6_2_XSD.zip');
    // Eindeutiger Schluessel, damit hinterlegte und abgerufene Version koexistieren.
    expect(vs[1]?.dir).toBe('xjustiz.de/3.6.2');
  });

  it('parseVersionsseite: Schematron- und PDF-Links werden ignoriert', () => {
    const vs = svc.parseVersionsseite(SEITE);
    expect(vs.length).toBe(2);
    expect(vs.some((v) => /sch/i.test(v.zipUrl ?? ''))).toBeFalse();
  });

  it('parseVersionsseite: ohne Schema-Links leere Liste', () => {
    expect(svc.parseVersionsseite('<html><body><a href="/a.pdf">x</a></body></html>')).toEqual([]);
  });
});
