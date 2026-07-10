import { TestBed } from '@angular/core/testing';
import { StateService } from './state.service';
import { TreeItem, TreeNode } from '../../models/node.model';

function node(path: string, over: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 1, path, name: path.split('/').pop() ?? path, min: '1', max: '1', doc: '',
    typeName: null, xsdEl: null, model: null, children: null, parent: null, depth: 0,
    synthetic: false, recursive: false, codelist: null, typeStack: [], inChoice: false,
    ...over,
  };
}

describe('StateService', () => {
  let s: StateService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    s = TestBed.inject(StateService);
  });

  describe('setElementProfile / pruneP', () => {
    it('legt einen Eintrag an und merged Felder', () => {
      s.setElementProfile('m/a', { status: 's1' });
      s.setElementProfile('m/a', { anmerkung: 'x' });
      expect(s.elemente()['m/a']).toEqual({ status: 's1', anmerkung: 'x' });
    });

    it('raeumt einen leer gewordenen Eintrag weg', () => {
      s.setElementProfile('m/a', { status: 's1' });
      s.setElementProfile('m/a', { status: undefined });
      expect(s.elemente()['m/a']).toBeUndefined();
    });

    it('behaelt Eintrag mit nicht-leeren werte', () => {
      s.setElementProfile('m/a', { werte: ['1'] });
      expect(s.elemente()['m/a']).toBeDefined();
      s.setElementProfile('m/a', { werte: [] });
      expect(s.elemente()['m/a']).toBeUndefined();
    });

    it('erzeugt eine neue Map-Referenz (Signal feuert)', () => {
      const before = s.elemente();
      s.setElementProfile('m/a', { status: 's1' });
      expect(s.elemente()).not.toBe(before);
    });
  });

  describe('Status-Zugriff', () => {
    it('statusOf/wirkungOf liefern die konfigurierte Stufe', () => {
      s.setElementProfile('m/a', { status: 's3' });
      expect(s.statusOf('m/a')?.name).toBe('nicht verwendet');
      expect(s.wirkungOf('m/a')).toBe('ausgeschlossen');
    });

    it('inheritedExcluded erkennt ausgeschlossene Vorfahren', () => {
      s.setElementProfile('m/a', { status: 's3' }); // ausgeschlossen
      expect(s.inheritedExcluded('m/a/b/c')).toBeTrue();
      expect(s.inheritedExcluded('m/x')).toBeFalse();
    });

    it('effKard beruecksichtigt Overrides', () => {
      const n = node('m/a', { min: '0', max: 'unbounded' });
      expect(s.effKard(n)).toEqual({ min: '0', max: 'unbounded', changed: false });
      s.setElementProfile('m/a', { max: '1' });
      expect(s.effKard(n)).toEqual({ min: '0', max: '1', changed: true });
    });
  });

  describe('Auspraegungen', () => {
    it('addAusp vergibt aufsteigende Default-Namen', () => {
      s.addAusp('m/bet');
      s.addAusp('m/bet');
      const list = s.auspsOf('m/bet')!;
      expect(list.map((a) => a.name)).toEqual(['Ausprägung 1', 'Ausprägung 2']);
    });

    it('removeAusp raeumt kaskadierend auf', () => {
      const id = s.addAusp('m/bet', 'Notar');
      const prefix = 'm/bet@' + id;
      // Unter-Profil, Unter-Ausprägung, Auswahl und Oeffnung aufsetzen.
      s.setElementProfile(prefix, { status: 's1' });
      s.setElementProfile(prefix + '/name', { anmerkung: 'x' });
      s.auspraegungen.update((m) => ({ ...m, [prefix + '/rolle']: [{ id: 'r1', name: 'R' }] }));
      s.selItem.set({ kind: 'el', node: node(prefix + '/name') } as TreeItem);
      s.setOpen(prefix, true);
      s.setOpen(prefix + '/name', true);

      s.removeAusp('m/bet', id);

      expect(s.auspsOf('m/bet')).toBeNull();
      expect(s.elemente()[prefix]).toBeUndefined();
      expect(s.elemente()[prefix + '/name']).toBeUndefined();
      expect(s.auspraegungen()[prefix + '/rolle']).toBeUndefined();
      expect(s.selItem()).toBeNull();
      expect(s.isOpen(prefix)).toBeFalse();
      expect(s.isOpen(prefix + '/name')).toBeFalse();
    });

    it('removeAusp laesst Geschwister-Ausprägungen stehen', () => {
      const a = s.addAusp('m/bet', 'A');
      const b = s.addAusp('m/bet', 'B');
      s.removeAusp('m/bet', a);
      const list = s.auspsOf('m/bet')!;
      expect(list.map((x) => x.id)).toEqual([b]);
    });
  });

  describe('Oeffnungszustaende', () => {
    it('toggleOpen schaltet um und erzeugt neues Set', () => {
      const before = s.open();
      s.toggleOpen('m/a');
      expect(s.isOpen('m/a')).toBeTrue();
      expect(s.open()).not.toBe(before);
      s.toggleOpen('m/a');
      expect(s.isOpen('m/a')).toBeFalse();
    });
  });

  describe('fortschritt', () => {
    it('zaehlt Festlegungen und Ausprägungen', () => {
      s.setElementProfile('m/a', { status: 's1' });
      s.setElementProfile('m/b', { anmerkung: 'nur Notiz' }); // kein Status
      s.addAusp('m/bet');
      expect(s.fortschritt()).toEqual({ nStatus: 1, nAusp: 1 });
    });
  });
});
