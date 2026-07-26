import { TestBed } from '@angular/core/testing';
import { DispositionService } from './disposition.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { XsdParserService } from './xsd-parser.service';

/**
 * Schema fuer die kaskadierende Pflicht-Vorbelegung (US "Pflicht-Vorbelegung
 * kaskadiert"): optionaler Block mit lokalem Pflicht-Rueckgrat, Auswahl mit
 * Zweig-Rueckgrat, Pflicht-Element fuer Auspraegungs-Kontexte.
 */
const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="beteiligter" type="Type.Test.Bet" maxOccurs="unbounded"/>
      <xs:element name="optionalBlock" type="Type.Test.Opt" minOccurs="0"/>
      <xs:choice>
        <xs:element name="varianteA" type="Type.Test.VarA"/>
        <xs:element name="varianteB" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Bet">
    <xs:sequence>
      <xs:element name="name" type="xs:string"/>
      <xs:element name="optionalFeld" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Opt">
    <xs:sequence>
      <xs:element name="pflichtImOptional" type="xs:string"/>
      <xs:element name="tiefOptional" type="Type.Test.Tief" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Tief">
    <xs:sequence><xs:element name="tiefPflicht" type="xs:string"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.VarA">
    <xs:sequence>
      <xs:element name="varPflicht" type="xs:string"/>
      <xs:element name="varOptional" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;

const ROOT = 'nachricht.test.0001';

describe('DispositionService — kaskadierende Pflicht-Vorbelegung', () => {
  let disposition: DispositionService;
  let state: StateService;
  let tree: TreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    disposition = TestBed.inject(DispositionService);
    state = TestBed.inject(StateService);
    tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx;
    state.root.set(tree.buildRoot(ROOT, idx));
  });

  it('belegt beim Setzen von "zwingend" das Pflicht-Rueckgrat darunter vor', () => {
    disposition.setzeStatus(ROOT + '/optionalBlock', 's1');

    // Das Element selbst traegt den gesetzten Status ...
    expect(state.statusOf(ROOT + '/optionalBlock')?.id).toBe('s1');
    // ... sein unbedingtes Pflichtkind wird als "zwingend" vorbelegt ...
    expect(state.statusOf(ROOT + '/optionalBlock/pflichtImOptional')?.id).toBe('s1');
    // ... optionale Kinder und deren Pflicht-Enkel bleiben ohne Disposition.
    expect(state.statusOf(ROOT + '/optionalBlock/tiefOptional')).toBeNull();
    expect(state.statusOf(ROOT + '/optionalBlock/tiefOptional/tiefPflicht')).toBeNull();
  });

  it('kaskadiert auch bei "anzugeben, wenn vorhanden" — Zielstufe ist die Pflicht-Stufe', () => {
    disposition.setzeStatus(ROOT + '/optionalBlock', 's2');

    expect(state.statusOf(ROOT + '/optionalBlock')?.id).toBe('s2');
    // Das Kind ist im Vorkommensfall zwingend — nicht "optional".
    expect(state.statusOf(ROOT + '/optionalBlock/pflichtImOptional')?.id).toBe('s1');
  });

  it('loest die Zielstufe ueber die Wirkung auf (umbenannte/eigene Statusstufen)', () => {
    state.setStatuses([
      { id: 'x9', name: 'MUSS', farbe: '#1D9E75', wirkung: 'pflicht' },
      { id: 'x2', name: 'KANN', farbe: '#BA7517', wirkung: 'optional' },
    ]);

    disposition.setzeStatus(ROOT + '/optionalBlock', 'x2');

    expect(state.statusOf(ROOT + '/optionalBlock/pflichtImOptional')?.id).toBe('x9');
  });

  it('kaskadiert beim Zulassen eines Auswahl-Zweigs in dessen lokales Rueckgrat', () => {
    disposition.setzeStatus(ROOT + '/_auswahl/varianteA', 's1');

    expect(state.statusOf(ROOT + '/_auswahl/varianteA/varPflicht')?.id).toBe('s1');
    expect(state.statusOf(ROOT + '/_auswahl/varianteA/varOptional')).toBeNull();
    // Der andere Zweig bleibt unangetastet.
    expect(state.statusOf(ROOT + '/_auswahl/varianteB')).toBeNull();
  });

  it('kaskadiert innerhalb einer Auspraegung im Pfadraum @auspId', () => {
    const auspId = state.addAusp(ROOT + '/beteiligter', 'Notar');
    const auspPath = ROOT + '/beteiligter@' + auspId;

    disposition.setzeStatus(auspPath, 's1');

    expect(state.statusOf(auspPath + '/name')?.id).toBe('s1');
    expect(state.statusOf(auspPath + '/optionalFeld')).toBeNull();
    // Der generische Pfadraum des Elements bleibt leer.
    expect(state.statusOf(ROOT + '/beteiligter/name')).toBeNull();
  });

  it('ueberschreibt vorhandene Kind-Status nicht (bestehende Vorbelegungs-Semantik)', () => {
    state.setElementProfile(ROOT + '/optionalBlock/pflichtImOptional', { status: 's4' });

    disposition.setzeStatus(ROOT + '/optionalBlock', 's1');

    expect(state.statusOf(ROOT + '/optionalBlock/pflichtImOptional')?.id).toBe('s4');
  });

  it('loest bei "zu klaeren" (markierung) und "nicht verwendet" keine Kaskade aus', () => {
    disposition.setzeStatus(ROOT + '/optionalBlock', 's4');
    expect(state.statusOf(ROOT + '/optionalBlock/pflichtImOptional')).toBeNull();

    disposition.setzeStatus(ROOT + '/optionalBlock', 's3');
    expect(state.statusOf(ROOT + '/optionalBlock/pflichtImOptional')).toBeNull();
  });

  it('loest beim Entfernen des Status ("wie Standard") keine Kaskade aus', () => {
    disposition.setzeStatus(ROOT + '/optionalBlock', undefined);

    expect(state.statusOf(ROOT + '/optionalBlock')).toBeNull();
    expect(Object.keys(state.elemente()).length).toBe(0);
  });
});
