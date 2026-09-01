import { TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { SchemaSuche } from './schema-suche';
import { StateService } from '../../core/services/state.service';
import { XsdParserService } from '../../core/services/xsd-parser.service';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.gds.basisnachricht.0005006" type="Type.GDS.Nachricht">
    <xs:annotation><xs:documentation>Die Basisnachricht.</xs:documentation></xs:annotation>
  </xs:element>
  <xs:complexType name="Type.GDS.Nachricht">
    <xs:sequence>
      <xs:element name="hersteller" type="Type.GDS.Herstellerinformation" minOccurs="0"/>
      <xs:element name="pflichtfeld" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.GDS.Herstellerinformation">
    <xs:sequence><xs:element name="produktname" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;

/** Zugriff auf die protected-Oberflaeche der Komponente (Muster: dashboard.spec.ts). */
interface SucheApi {
  query: WritableSignal<string>;
  aktiv: WritableSignal<number>;
  hasIdx: () => boolean;
  alle: () => { art: 'nachricht' | 'typ'; name: string }[];
  nachrichten: () => { name: string }[];
  typen: () => { name: string }[];
  onKeydown: (e: KeyboardEvent) => void;
  oeffne: (art: 'nachricht' | 'typ', name: string) => Promise<void>;
}

describe('SchemaSuche — Schema-Suche auf dem Dashboard', () => {
  let suche: SucheApi;
  let state: StateService;
  const M = 'nachricht.gds.basisnachricht.0005006';
  const TYP = 'Type.GDS.Herstellerinformation';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SchemaSuche] }).compileComponents();
    state = TestBed.inject(StateService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    state.idx.set(TestBed.inject(XsdParserService).buildIndexFrom([{ file: 'test.xsd', dom }]).idx);
    suche = TestBed.createComponent(SchemaSuche).componentInstance as unknown as SucheApi;
  });

  it('ist erst mit geladenem Schema bedienbar', () => {
    expect(suche.hasIdx()).toBeTrue();
    state.idx.set(null);
    expect(suche.hasIdx()).toBeFalse();
  });

  it('findet Nachrichten und Datentypen ohne Baum', () => {
    expect(state.root()).toBeNull();
    suche.query.set('hersteller');
    expect(suche.typen().map((t) => t.name)).toEqual([TYP]);
    suche.query.set('basisnachricht');
    expect(suche.nachrichten().map((m) => m.name)).toEqual([M]);
  });

  it('Nachrichten-Treffer oeffnet die Schema-Ansicht und laedt die Nachricht', async () => {
    await suche.oeffne('nachricht', M);
    expect(state.view()).toBe('editor');
    expect(state.msgName()).toBe(M);
    expect(state.root()?.path).toBe(M);
    // Reine Ansicht: gesperrt, kein Autosave-Ziel, keine Zwingend-Vorbelegung.
    expect(state.schemaView()).toBeTrue();
    expect(state.readOnly()).toBeTrue();
    expect(state.activeProfileId()).toBeNull();
    expect(Object.keys(state.elemente()).length).toBe(0);
  });

  it('Datentyp-Treffer oeffnet den Typ als Baumwurzel', async () => {
    await suche.oeffne('typ', TYP);
    expect(state.view()).toBe('editor');
    expect(state.typName()).toBe(TYP);
    expect(state.msgName()).toBeNull();
    expect(state.root()?.path).toBe(TYP);
    expect(state.schemaView()).toBeTrue();
    expect(state.readOnly()).toBeTrue();
  });

  it('↑/↓ wandern durch beide Sektionen, Enter nimmt den aktiven Treffer', async () => {
    // "gds" trifft die Nachricht (Segment) und den Typ (Segment).
    suche.query.set('gds');
    expect(suche.alle().map((t) => t.art)).toEqual(['nachricht', 'typ', 'typ']);
    suche.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(suche.aktiv()).toBe(1);
    suche.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    suche.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(suche.aktiv()).toBe(0);
    suche.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    await Promise.resolve();
    expect(state.msgName()).toBe(M);
  });
});
