import { TestBed } from '@angular/core/testing';
import { DetailAnsicht } from './detail-ansicht';
import { BaumkastenAnsicht } from './baumkasten-ansicht';
import { StateService } from '../services/state.service';
import { TreeService } from '../services/tree.service';
import { XsdParserService } from '../services/xsd-parser.service';
import { TreeNode as TNode } from '../../models/node.model';
import {
  STANDARD_ERKLAERUNG,
  STANDARD_TASTE,
  WIRKUNG_ERKLAERUNG,
  WIRKUNG_TASTE,
} from '../profile-defaults';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="datum" type="xs:date"/>
      <xs:element name="akte" type="Type.Test.Akte" minOccurs="0" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Akte">
    <xs:sequence><xs:element name="identifikation" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;

/**
 * Die Anzeige-Ableitung des Detailbereichs. Sie lag als `computed` in einer
 * Komponente mit 13 Abhängigkeiten und war nur über das gerenderte Panel
 * prüfbar; hier geht der Zustand hinein und das Modell heraus.
 */
describe('DetailAnsicht', () => {
  let ansicht: DetailAnsicht;
  let baum: BaumkastenAnsicht;
  let state: StateService;
  let tree: TreeService;
  let root: TNode;

  const M = 'nachricht.test.0001';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    ansicht = TestBed.inject(DetailAnsicht);
    baum = TestBed.inject(BaumkastenAnsicht);
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

  const waehle = (name: string): void => {
    const node = tree.kinder(root).find((k) => k.path === `${M}/${name}`)!;
    state.selItem.set({ kind: 'el', node });
  };

  it('ohne Auswahl gibt es keinen Punkt (Ruhezustand des Panels)', () => {
    expect(ansicht.punkt()).toBeNull();
  });

  it('nennt Titel, technischen Untertitel und Standard-Kardinalität', () => {
    waehle('akte');
    const v = ansicht.punkt()!;

    expect(v.title).toBe('Akte');
    expect(v.sub).toContain('akte : Type.Test.Akte');
    expect(v.sub).toContain('Standard: beliebig viele');
    expect(v.leaf).toBeFalse();
  });

  it('Vorkommen-Liste erscheint nur an wiederholbaren Elementen', () => {
    waehle('akte');
    expect(ansicht.punkt()!.showAusps).toBeTrue();

    waehle('datum');
    expect(ansicht.punkt()!.showAusps).toBeFalse();
  });

  it('führt die angelegten Vorkommen mit ihrem Entfernen-Grund', () => {
    state.addAusp(`${M}/akte`, 'Hauptakte');
    waehle('akte');

    const liste = ansicht.punkt()!.auspList;
    expect(liste.map((a) => a.name)).toEqual(['Hauptakte']);
    expect(liste[0]!.sperre).toBeNull();
  });

  // Der Wortlaut der Sperre stand vorher zweimal da — im Kasten anders als im
  // Detailbereich. Beide lesen jetzt dieselbe Formulierung.
  it('nennt dieselbe Sperrbegründung wie der Baumkasten', () => {
    state.setVorgabe({
      meta: {},
      statuses: [
        { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
      ],
      elemente: { [`${M}/akte`]: { status: 'v9', anmerkung: 'Ohne Akte.' } },
      auspraegungen: {},
      erweiterungen: {},
    });
    state.messageCreate.set({ msgName: M, entryId: null, name: null });
    waehle('akte');

    const v = ansicht.punkt()!;
    expect(v.gesperrt).toBeTrue();
    expect(v.sperrGrund).toBe(baum.sperrGrund(`${M}/akte`));
    expect(v.sperrGrund).toContain('Begründung aus der Profilierung: Ohne Akte.');
  });

  it('meldet den typwidrigen Beispielwert', () => {
    state.setElementProfile(`${M}/datum`, { beispiel: 'kein Datum' });
    waehle('datum');

    expect(ansicht.punkt()!.beispielProblem).toBeTruthy();
  });
});

/**
 * Antwort-Liste des Detailbereichs (Editor v4): der Statusname ist frei
 * gewaehlt — Klartext und Taste haengen an der **Wirkung**. Fuehrt eine
 * Profilierung mehrere Stufen derselben Wirkung, traegt nur die erste die
 * Taste; sonst zeigten zwei Zeilen dieselbe an und eine davon loege.
 */
describe('DetailAnsicht — Antworten mit Klartext und Taste', () => {
  let ansicht: DetailAnsicht;
  let state: StateService;
  let tree: TreeService;
  let root: TNode;

  const M = 'nachricht.test.0001';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    ansicht = TestBed.inject(DetailAnsicht);
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
    const node = tree.kinder(root).find((k) => k.path === `${M}/datum`)!;
    state.selItem.set({ kind: 'el', node });
  });

  it('nennt zu jeder Antwort die Erklärung ihrer Wirkung und die Taste', () => {
    const knoepfe = ansicht.punkt()!.statusButtons;

    expect(knoepfe.map((b) => b.taste)).toEqual([
      STANDARD_TASTE,
      WIRKUNG_TASTE.pflicht,
      WIRKUNG_TASTE.optional,
      WIRKUNG_TASTE.ausgeschlossen,
      WIRKUNG_TASTE.markierung,
    ]);
    expect(knoepfe[0]!.erklaerung).toBe(STANDARD_ERKLAERUNG);
    expect(knoepfe[1]!.erklaerung).toBe(WIRKUNG_ERKLAERUNG.pflicht);
    // Die getönte Fläche der aktiven Zeile — nicht die volle Statusfarbe.
    expect(knoepfe[1]!.farbeHell).toContain('color-mix');
    expect(knoepfe[1]!.farbeHell).toContain(state.statuses()[0]!.farbe);
  });

  it('gibt die Taste nur der ersten Stufe je Wirkung', () => {
    state.statuses.set([
      { id: 'a', name: 'zwingend', farbe: '#1D9E75', wirkung: 'pflicht' },
      { id: 'b', name: 'zwingend, sobald bekannt', farbe: '#12684F', wirkung: 'pflicht' },
    ]);

    const knoepfe = ansicht.punkt()!.statusButtons;
    expect(knoepfe.map((b) => b.taste)).toEqual([STANDARD_TASTE, WIRKUNG_TASTE.pflicht, null]);
  });

  it('meldet die getroffene Antwort im Klartext — ohne eigene Vorgabe null', () => {
    expect(ansicht.punkt()!.curStatus).toBeNull();

    state.setElementProfile(`${M}/datum`, { status: 's1' });
    const cur = ansicht.punkt()!.curStatus!;
    expect(cur.name).toBe('zwingend');
    expect(cur.wirkung).toBe('pflicht');
    expect(cur.erklaerung).toBe(WIRKUNG_ERKLAERUNG.pflicht);
  });

  it('schreibt die Kardinalität im Klartext — eigene Vorgabe schlägt den Standard', () => {
    const node = tree.kinder(root).find((k) => k.path === `${M}/akte`)!;
    state.selItem.set({ kind: 'el', node });
    expect(ansicht.punkt()!.kardText).toBe('beliebig viele');

    state.setElementProfile(`${M}/akte`, { min: '1', max: '3' });
    expect(ansicht.punkt()!.kardText).toBe('eigene Vorgabe: 1 bis 3');
  });
});
