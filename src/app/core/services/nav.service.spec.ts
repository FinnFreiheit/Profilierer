import { TestBed } from '@angular/core/testing';
import { NavService } from './nav.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { DiffService } from './diff.service';
import { TreeNode } from '../../models/node.model';
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
