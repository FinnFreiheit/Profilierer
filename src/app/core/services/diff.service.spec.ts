import { TestBed } from '@angular/core/testing';
import { DiffService } from './diff.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';

const XSD_A = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.diff.0001" type="Type.Diff.Root"/>
  <xs:element name="nachricht.nur-a.0009" type="Type.Diff.Klein"/>
  <xs:complexType name="Type.Diff.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
    <xs:element name="alt" type="xs:string" minOccurs="0"/>
    <xs:element name="typwechsel" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Diff.Klein"><xs:sequence>
    <xs:element name="x" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const XSD_B = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="4.0.0">
  <xs:element name="nachricht.diff.0001" type="Type.Diff.Root"/>
  <xs:element name="nachricht.nur-b.0010" type="Type.Diff.Klein"/>
  <xs:complexType name="Type.Diff.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string" minOccurs="0"/>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
    <xs:element name="typwechsel" type="xs:date"/>
    <xs:element name="neuFeld" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Diff.Klein"><xs:sequence>
    <xs:element name="x" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.diff.0001';

describe('DiffService', () => {
  let svc: DiffService;
  let state: StateService;

  const parse = (xsd: string) => {
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(xsd, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    return parser.buildIndexFrom(docs).idx;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(DiffService);
    state = TestBed.inject(StateService);
    state.idx.set(parse(XSD_A));
    state.idxB.set(parse(XSD_B));
    state.msgName.set(M);
  });

  describe('computeDiff', () => {
    it('listet Nachrichten, die nur in einer Version existieren', () => {
      const d = svc.computeDiff();
      expect(d.msgOnlyA).toEqual(['nachricht.nur-a.0009']);
      expect(d.msgOnlyB).toEqual(['nachricht.nur-b.0010']);
    });

    it('meldet msgInB=false, wenn die Nachricht in B fehlt', () => {
      state.msgName.set('nachricht.nur-a.0009');
      const d = svc.computeDiff();
      expect(d.msgInB).toBeFalse();
      expect(d.rows.length).toBe(0);
    });

    it('erkennt entfernte, neue und geaenderte Elemente', () => {
      const rows = svc.computeDiff().rows;
      const byRel = new Map(rows.map((r) => [r.rel, r]));
      expect(byRel.get('/alt')?.art).toBe('entfernt');
      expect(byRel.get('/neuFeld')?.art).toBe('neu');
      expect(byRel.get('/kopf')?.art).toBe('geändert');
      expect(byRel.get('/kopf')?.info).toContain('Kardinalität');
      expect(byRel.get('/typwechsel')?.art).toBe('geändert');
      expect(byRel.get('/typwechsel')?.info).toContain('Typ');
      expect(byRel.has('/az')).toBeFalse(); // unveraendert
    });

    it('markiert entfernte Elemente mit prof, wenn darunter profiliert wurde', () => {
      state.setElementProfile(`${M}/alt`, { status: 's1' });
      const rows = svc.computeDiff().rows;
      expect(rows.find((r) => r.rel === '/alt')?.prof).toBeTrue();
      expect(rows.find((r) => r.rel === '/kopf')?.prof).toBeFalse();
    });
  });

  describe('computeDiffMap', () => {
    it('befuellt diffMap und zaehlt Unterschiede am Vorfahren (Wurzel)', () => {
      svc.computeDiffMap();
      const map = state.diffMap()!;
      expect(map.get('/alt')?.art).toBe('entfernt');
      const rootAnc = state.diffAnc()!.get('')!;
      expect(rootAnc.entfernt).toBe(1);
      expect(rootAnc.neu).toBe(1);
      expect(rootAnc['geändert']).toBe(2);
    });

    it('setzt die Karten zurueck, wenn keine Vergleichsversion geladen ist', () => {
      svc.computeDiffMap();
      state.idxB.set(null);
      svc.computeDiffMap();
      expect(state.diffMap()).toBeNull();
      expect(state.diffAnc()).toBeNull();
    });
  });
});
