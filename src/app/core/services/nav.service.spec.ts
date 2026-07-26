import { TestBed } from '@angular/core/testing';
import { NavService } from './nav.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { DiffService } from './diff.service';
import { TreeItem, TreeNode, itemPath } from '../../models/node.model';
import { XsdIndex } from '../../models/xsd-index.model';

function node(path: string, over: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 1,
    path,
    name: path.split('/').pop() ?? path,
    min: '1',
    max: '1',
    doc: '',
    typeName: null,
    xsdEl: null,
    model: null,
    children: null,
    parent: null,
    depth: 0,
    synthetic: false,
    recursive: false,
    codelist: null,
    typeStack: [],
    inChoice: false,
    ...over,
  };
}

describe('NavService — Schema-Ansicht (US "Schema ansehen")', () => {
  let nav: NavService;
  let state: StateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: TreeService, useValue: { buildRoot: () => node('nachricht.test') } }],
    });
    nav = TestBed.inject(NavService);
    state = TestBed.inject(StateService);
    state.idx.set({ el: {}, messages: [] } as unknown as XsdIndex);
  });

  it('openSchemaView oeffnet den Editor gesperrt und ohne Autosave-Ziel', () => {
    state.activeProfileId.set('p1');
    nav.openSchemaView();
    expect(state.view()).toBe('editor');
    expect(state.schemaView()).toBeTrue();
    expect(state.readOnly()).toBeTrue();
    expect(state.activeProfileId()).toBeNull();
    expect(state.guided()).toBeFalse();
    expect(state.root()).toBeNull();
  });

  it('loadMessage erhaelt die Schema-Ansicht (schemaView/readOnly bleiben gesetzt)', () => {
    nav.openSchemaView();
    nav.loadMessage('nachricht.test');
    expect(state.root()).not.toBeNull();
    expect(state.schemaView()).toBeTrue();
    expect(state.readOnly()).toBeTrue();
    // Keine Profilierung: nichts vorbelegt, kein Autosave-Ziel.
    expect(Object.keys(state.elemente()).length).toBe(0);
    expect(state.activeProfileId()).toBeNull();
  });

  it('loadMessage ausserhalb der Schema-Ansicht setzt den Modus nicht', () => {
    nav.loadMessage('nachricht.test');
    expect(state.schemaView()).toBeFalse();
    expect(state.readOnly()).toBeFalse();
  });

  it('Profil-Einstieg (loadProfile) beendet die Schema-Ansicht', () => {
    nav.openSchemaView();
    state.resetProfile();
    expect(state.schemaView()).toBeFalse();
    expect(state.readOnly()).toBeFalse();
  });
});

/** Baum-Attrappe: Kind-Pfade je Pfad, Items lazy erzeugt (wie childItems). */
function mockTree(children: Record<string, string[]>): Partial<TreeService> {
  const itemFor = (p: string): TreeItem => ({ kind: 'el', node: node(p) });
  return {
    childItems: (it: TreeItem) => (children[itemPath(it)] ?? []).map(itemFor),
    itemHasKids: (it: TreeItem) => (children[itemPath(it)] ?? []).length > 0,
  };
}

describe('NavService — expandSubtree (Kontextmenue "Alle Kinder ausklappen")', () => {
  function setup(children: Record<string, string[]>): { nav: NavService; state: StateService } {
    TestBed.configureTestingModule({
      providers: [{ provide: TreeService, useValue: mockTree(children) }],
    });
    return { nav: TestBed.inject(NavService), state: TestBed.inject(StateService) };
  }

  it('oeffnet den kompletten Teilbaum ab dem Item (Knoten selbst inklusive)', () => {
    const { nav, state } = setup({
      m: ['m/a', 'm/x'],
      'm/a': ['m/a/b', 'm/a/c'],
      'm/a/b': ['m/a/b/d'],
    });
    state.open.set(new Set(['m']));
    const vollstaendig = nav.expandSubtree({ kind: 'el', node: node('m/a') });
    expect(vollstaendig).toBeTrue();
    // Blaetter (m/a/c, m/a/b/d) und fremde Aeste (m/x) landen nicht in open.
    expect([...state.open()].sort()).toEqual(['m', 'm/a', 'm/a/b']);
  });

  it('bricht bei Tiefe > 25 ab und meldet den Abbruch', () => {
    const children: Record<string, string[]> = {};
    for (let i = 0; i < 30; i++) children['n' + i] = ['n' + (i + 1)];
    const { nav, state } = setup(children);
    state.open.set(new Set());
    const vollstaendig = nav.expandSubtree({ kind: 'el', node: node('n0') });
    expect(vollstaendig).toBeFalse();
    expect(state.isOpen('n0')).toBeTrue();
    expect(state.isOpen('n29')).toBeFalse();
  });

  it('bricht bei mehr als 5000 Knoten ab und meldet den Abbruch', () => {
    const children: Record<string, string[]> = { w: [] };
    for (let i = 0; i < 6000; i++) {
      children['w']!.push('w/k' + i);
      children['w/k' + i] = ['w/k' + i + '/blatt'];
    }
    const { nav, state } = setup(children);
    state.open.set(new Set());
    const vollstaendig = nav.expandSubtree({ kind: 'el', node: node('w') });
    expect(vollstaendig).toBeFalse();
    expect(state.open().size).toBeGreaterThan(5000);
    expect(state.open().size).toBeLessThan(6001);
  });

  it('setzt das open-Set genau einmal (ein Redraw)', () => {
    const { nav, state } = setup({ m: ['m/a'], 'm/a': ['m/a/b'], 'm/a/b': ['m/a/b/c'] });
    const spy = spyOn(state.open, 'set').and.callThrough();
    nav.expandSubtree({ kind: 'el', node: node('m') });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('NavService — Diff-Karte bei Nachrichtenwechsel', () => {
  let nav: NavService;
  let state: StateService;
  let diff: DiffService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: TreeService, useValue: { buildRoot: () => node('nachricht.test') } }],
    });
    nav = TestBed.inject(NavService);
    state = TestBed.inject(StateService);
    diff = TestBed.inject(DiffService);
    state.idx.set({ el: {}, messages: [] } as unknown as XsdIndex);
  });

  it('berechnet die Diff-Karte neu, wenn eine Vergleichsversion geladen ist', () => {
    const spy = spyOn(diff, 'computeDiffMap');
    state.idxB.set({ el: {}, messages: [] } as unknown as XsdIndex);
    nav.loadMessage('nachricht.test');
    expect(spy).toHaveBeenCalled();
  });

  it('laesst die Diff-Berechnung ohne Vergleichsversion aus', () => {
    const spy = spyOn(diff, 'computeDiffMap');
    nav.loadMessage('nachricht.test');
    expect(spy).not.toHaveBeenCalled();
  });
});
