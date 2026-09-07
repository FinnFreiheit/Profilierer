import { TestBed } from '@angular/core/testing';
import { BaumkastenAnsicht, Kennzeichen } from './baumkasten-ansicht';
import { StateService } from '../services/state.service';
import { TreeService } from '../services/tree.service';
import { XsdParserService } from '../services/xsd-parser.service';
import { TreeItem, TreeNode as TNode, itemPath } from '../../models/node.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="datum" type="xs:date"/>
      <xs:element name="akte" type="Type.Test.Akte" minOccurs="0"/>
      <xs:element name="frei" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Akte">
    <xs:sequence><xs:element name="identifikation" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;

/**
 * Der Kennzeichen-Katalog des Baumkastens. Er lag bis zur Herauslösung als
 * `computed` in der Komponente und war nur über DOM-Selektoren erreichbar —
 * geprüft waren drei von zwanzig Kennzeichen. Hier setzt der Test am Interface
 * des Moduls an: Zustand hinein, Ansicht heraus, kein Rendering.
 */
describe('BaumkastenAnsicht', () => {
  let ansicht: BaumkastenAnsicht;
  let state: StateService;
  let tree: TreeService;
  let root: TNode;

  const M = 'nachricht.test.0001';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    ansicht = TestBed.inject(BaumkastenAnsicht);
    state = TestBed.inject(StateService);
    tree = TestBed.inject(TreeService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const idx = TestBed.inject(XsdParserService).buildIndexFrom([
      { file: 'xjustiz_0000_test.xsd', dom },
    ]).idx;
    state.idx.set(idx);
    state.msgName.set(M);
    root = tree.buildRoot(M, idx);
    state.root.set(root);
  });

  /** Das Item eines direkten Kindes der Nachricht. */
  const item = (name: string): TreeItem => ({
    kind: 'el',
    node: tree.kinder(root).find((k) => k.path === `${M}/${name}`)!,
  });

  const klassen = (name: string): string[] =>
    ansicht.kasten(item(name)).kennzeichen.map((k: Kennzeichen) => k.cls);

  const kennzeichen = (name: string, cls: string): Kennzeichen | undefined =>
    ansicht.kasten(item(name)).kennzeichen.find((k) => k.cls === cls);

  /** Gebundener Durchlauf mit eigener Stufenliste der Vorgabe. */
  const bindeVorgabe = (
    elemente: Record<string, { status?: string; anmerkung?: string }>,
  ): void => {
    state.setVorgabe({
      meta: {},
      statuses: [
        { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
        { id: 'v1', name: 'zwingend', farbe: '#1D9E75', wirkung: 'pflicht' },
        { id: 'v4', name: 'zu klären', farbe: '#7A5AF8', wirkung: 'markierung' },
      ],
      elemente,
      auspraegungen: {},
      erweiterungen: {},
    });
    state.messageCreate.set({ msgName: M, entryId: null, name: null });
  };

  describe('Sperre der gebundenen Fassung', () => {
    it('kennzeichnet das ausgeschlossene Element und nennt den eigenen Ausschluss', () => {
      bindeVorgabe({ [`${M}/akte`]: { status: 'v9' } });

      expect(klassen('akte')).toContain('t-lock');
      // Derselbe Wortlaut wie im Detailbereich, inklusive Name der Stufe.
      expect(kennzeichen('akte', 't-lock')?.title).toContain(
        'setzt dieses Element auf „nicht verwendet"',
      );
    });

    it('nennt am geerbten Ausschluss das übergeordnete Element', () => {
      bindeVorgabe({ [`${M}/akte`]: { status: 'v9' } });

      expect(ansicht.sperrGrund(`${M}/akte/identifikation`)).toContain(
        'Ein übergeordnetes Element ist in der gebundenen Profilierung ausgeschlossen',
      );
    });

    it('hängt die Anmerkung der Profilierung an die Begründung', () => {
      bindeVorgabe({ [`${M}/akte`]: { status: 'v9', anmerkung: 'In diesem Szenario ohne Akte.' } });

      expect(kennzeichen('akte', 't-lock')?.title).toContain(
        'Begründung aus der Profilierung: In diesem Szenario ohne Akte.',
      );
    });

    it('ohne Bindung gibt es kein Sperr-Kennzeichen', () => {
      expect(klassen('akte')).not.toContain('t-lock');
    });
  });

  describe('Marker der gebundenen Fassung', () => {
    it('„zu klären“: die Profilierung markiert nur', () => {
      bindeVorgabe({ [`${M}/akte`]: { status: 'v4' } });

      expect(klassen('akte')).toContain('t-klaeren');
    });

    it('„nicht profiliert“: die Profilierung sagt zu dem Element nichts', () => {
      bindeVorgabe({ [`${M}/akte`]: { status: 'v1' } });

      // `akte` ist festgelegt (zwingend) — kein Marker; `frei` kommt in der
      // gebundenen Fassung gar nicht vor.
      expect(klassen('akte')).not.toContain('t-nprof');
      expect(klassen('frei')).toContain('t-nprof');
    });

    it('das gesperrte Element trägt seinen eigenen Marker, keinen zweiten', () => {
      bindeVorgabe({ [`${M}/akte`]: { status: 'v9' } });

      expect(klassen('akte')).toContain('t-lock');
      expect(klassen('akte')).not.toContain('t-nprof');
    });
  });

  describe('Schema-Validierung des letzten Prüflaufs', () => {
    it('meldet den eigenen Fehler mit seinem Text', () => {
      state.valFehler.set(new Map([[`${M}/datum`, ['Datum ist kein xs:date']]]));

      expect(klassen('datum')).toContain('t-verr');
      expect(kennzeichen('datum', 't-verr')?.title).toBe('Datum ist kein xs:date');
      expect(ansicht.kasten(item('datum')).valErr).toBeTrue();
    });

    it('zählt Fehler untergeordneter Elemente am Container', () => {
      state.valFehler.set(new Map());
      state.valAnc.set(new Map([[`${M}/akte`, 3]]));

      expect(kennzeichen('akte', 't-vsub')?.text).toBe('3 Fehler');
      expect(ansicht.kasten(item('akte')).valErr).toBeFalse();
    });
  });

  describe('Versionsvergleich', () => {
    beforeEach(() => {
      state.showDiff.set(true);
      state.idxB.set({ version: '4.0.0' } as never);
    });

    it('meldet ein in der neuen Version entfallenes Element', () => {
      state.diffMap.set(new Map([['/akte', { art: 'entfernt', info: '' } as never]]));

      const v = ansicht.kasten(item('akte'));
      expect(v.kennzeichen.map((k) => k.cls)).toContain('t-dent');
      expect(v.dfR).toBeTrue();
    });

    it('aggregiert Unterschiede im Teilbaum', () => {
      state.diffMap.set(new Map());
      state.diffAnc.set(new Map([['/akte', { neu: 2, entfernt: 0, geändert: 1 }]]));

      const tag = kennzeichen('akte', 't-dsub');
      expect(tag?.text).toBe('Δ 3');
      expect(tag?.title).toContain('2 neu, 1 geändert');
      expect(ansicht.kasten(item('akte')).dfA).toBeTrue();
    });

    it('Diff-Kennzeichen stehen hinten — die fachlichen zuerst', () => {
      state.diffMap.set(new Map([['/akte', { art: 'geändert', info: 'Kardinalität' } as never]]));
      state.setElementProfile(`${M}/akte`, { anmerkung: 'Notiz' });

      const cls = klassen('akte');
      expect(cls.indexOf('t-note')).toBeLessThan(cls.indexOf('t-daend'));
    });
  });

  describe('Kinder und Knöpfe', () => {
    it('„nur Profil“ blendet ausgeschlossene Kinder aus der Liste', () => {
      const wurzel: TreeItem = { kind: 'el', node: root };
      expect(ansicht.kinder(wurzel).length).toBe(3);

      state.setStatuses([
        { id: 's9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
      ]);
      state.setElementProfile(`${M}/frei`, { status: 's9' });
      state.onlyProfile.set(true);

      expect(ansicht.kinder(wurzel).map(itemPath)).toEqual([`${M}/datum`, `${M}/akte`]);
    });

    it('„+ Vorkommen“ erscheint erst, wenn das Element Vorkommen führt', () => {
      expect(ansicht.zeigtVorkommenHinzu(item('akte'))).toBeFalse();

      state.addAusp(`${M}/akte`, 'Hauptakte');

      expect(ansicht.zeigtVorkommenHinzu(item('akte'))).toBeTrue();
    });

    it('„+ Element (Erweiterung)“ nur an aufklappbaren Containern', () => {
      expect(ansicht.zeigtErweiterungHinzu(item('akte'))).toBeTrue();
      expect(ansicht.zeigtErweiterungHinzu(item('datum'))).toBeFalse();
    });
  });

  /**
   * Der Farbstreifen links am Kasten steht immer — er ist die Zeile, an der
   * man den Zustand eines Astes im Vorbeigehen liest. Ohne eigene Antwort sagt
   * er, was das Schema verlangt.
   */
  describe('Statusstreifen', () => {
    it('mit eigener Antwort die Farbe der Statusstufe', () => {
      state.setElementProfile(`${M}/frei`, { status: 's1' });

      expect(ansicht.kasten(item('frei')).statusStrip).toBe('#1D9E75');
    });

    it('ohne Antwort: Pflicht laut Schema gedämpft grün', () => {
      expect(ansicht.kasten(item('datum')).statusStrip).toBe('var(--schema-pflicht)');
    });

    it('ohne Antwort: optionale Angabe nur in Rahmenfarbe', () => {
      expect(ansicht.kasten(item('frei')).statusStrip).toBe('var(--border)');
    });

    /**
     * Ein Vorkommen ist keine Angabe des Schemas: `min`/`inChoice` gehoeren
     * dem tragenden Element, nicht der Auspraegung. Uebernaehme der Streifen
     * sie, traege jedes Vorkommen eines Pflicht-Elements das Pflicht-Gruen,
     * obwohl das Schema ueber Vorkommen gar nichts sagt.
     */
    it('eine Auspraegung erbt die Schema-Pflicht ihres Elements nicht', () => {
      const traeger = tree.kinder(root).find((k) => k.path === `${M}/datum`)!;
      expect(ansicht.kasten({ kind: 'el', node: traeger }).statusStrip).toBe(
        'var(--schema-pflicht)',
      );

      const vorkommen: TreeItem = {
        kind: 'ausp',
        parentNode: traeger,
        ausp: { id: 'a1', name: 'Erstes' },
        path: `${M}/datum@a1`,
      };
      expect(ansicht.kasten(vorkommen).statusStrip).toBe('var(--border)');
    });

    /** Die Wurzel ist die Nachricht selbst — sie schuldet sich nicht. */
    it('die Wurzel traegt keinen Pflicht-Streifen', () => {
      expect(ansicht.kasten({ kind: 'el', node: root }).statusStrip).toBe('var(--border)');
    });

    it('ein synthetischer Knoten schuldet nichts', () => {
      // „(Auswahl)" ist kein Element, sondern die Klammer um mehrere — ihre
      // Mindestanzahl 1 ist keine Pflicht zu einer Angabe.
      const MW = 'nachricht.test.0002';
      const dom = new DOMParser().parseFromString(
        `<?xml version="1.0" encoding="UTF-8"?>
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
          <xs:element name="${MW}" type="Type.Test.Wahl"/>
          <xs:complexType name="Type.Test.Wahl">
            <xs:sequence>
              <xs:choice>
                <xs:element name="links" type="xs:string"/>
                <xs:element name="rechts" type="xs:string"/>
              </xs:choice>
            </xs:sequence>
          </xs:complexType>
        </xs:schema>`,
        'application/xml',
      );
      const idx = TestBed.inject(XsdParserService).buildIndexFrom([
        { file: 'xjustiz_0000_wahl.xsd', dom },
      ]).idx;
      state.idx.set(idx);
      state.msgName.set(MW);
      const wurzel = tree.buildRoot(MW, idx);
      state.root.set(wurzel);
      const synth = tree.kinder(wurzel).find((k) => k.synthetic)!;

      expect(ansicht.kasten({ kind: 'el', node: synth }).statusStrip).toBe('var(--border)');
    });
  });

  /**
   * Farbige Umrandung („Ansicht ▾"): drei Schalter, dieselbe Zählweise wie der
   * Stand in der Arbeits-Zeile. Ein geparkter Punkt („zu klären") ist weder
   * offen noch beantwortet — sonst zählte die Zeile anders, als der Baum färbt.
   */
  describe('Farbige Umrandung', () => {
    it('ohne Schalter bleibt kein Kasten markiert', () => {
      state.setElementProfile(`${M}/frei`, { status: 's1', anmerkung: 'Rückfrage' });

      expect(ansicht.kasten(item('frei')).markiert).toBeFalse();
    });

    it('„offen“ markiert die unbeantworteten Entscheidungspunkte', () => {
      state.hervorhebung.set({ offen: true, beantwortet: false, notiz: false });

      expect(ansicht.kasten(item('frei')).markiert).toBeTrue();
      // Pflichtangabe ohne Wahlmöglichkeit: gar kein Entscheidungspunkt.
      expect(ansicht.kasten(item('datum')).markiert).toBeFalse();
    });

    it('„beantwortet“ markiert erst nach der Antwort', () => {
      state.hervorhebung.set({ offen: false, beantwortet: true, notiz: false });
      expect(ansicht.kasten(item('frei')).markiert).toBeFalse();

      state.setElementProfile(`${M}/frei`, { status: 's1' });

      expect(ansicht.kasten(item('frei')).markiert).toBeTrue();
      expect(ansicht.kasten(item('datum')).markiert).toBeFalse();
    });

    it('ein geparkter Punkt („zu klären“) ist weder offen noch beantwortet', () => {
      state.setElementProfile(`${M}/frei`, { status: 's4' });

      state.hervorhebung.set({ offen: true, beantwortet: false, notiz: false });
      expect(ansicht.kasten(item('frei')).markiert).toBeFalse();

      state.hervorhebung.set({ offen: false, beantwortet: true, notiz: false });
      expect(ansicht.kasten(item('frei')).markiert).toBeFalse();
    });

    it('„Notiz“ markiert auch ein Element, das kein Entscheidungspunkt ist', () => {
      state.setElementProfile(`${M}/datum`, { anmerkung: 'mit der Fachseite klären' });
      state.hervorhebung.set({ offen: false, beantwortet: false, notiz: true });

      expect(ansicht.kasten(item('datum')).markiert).toBeTrue();
      expect(ansicht.kasten(item('frei')).markiert).toBeFalse();
    });

    it('Leerraum ist keine Notiz', () => {
      state.setElementProfile(`${M}/datum`, { anmerkung: '   ' });
      state.hervorhebung.set({ offen: false, beantwortet: false, notiz: true });

      expect(ansicht.kasten(item('datum')).markiert).toBeFalse();
    });
  });
});
