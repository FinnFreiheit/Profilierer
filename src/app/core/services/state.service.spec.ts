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

    it('behaelt Eintrag mit werte — auch ein leeres Array („keine Werte zugelassen")', () => {
      s.setElementProfile('m/a', { werte: ['1'] });
      expect(s.elemente()['m/a']).toBeDefined();
      s.setElementProfile('m/a', { werte: [] });
      expect(s.elemente()['m/a']).toEqual({ werte: [] });
    });

    it('raeumt Eintrag erst weg, wenn werte auf undefined gesetzt wird', () => {
      s.setElementProfile('m/a', { werte: [] });
      s.setElementProfile('m/a', { werte: undefined });
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

    it('removeAusp raeumt auch Erweiterungen unter der Auspraegung weg', () => {
      const id = s.addAusp('m/bet', 'Notar');
      const prefix = 'm/bet@' + id;
      s.addErweiterung(prefix, { name: 'zusatz', min: '1', max: '1', datentyp: 'string' });
      expect(s.erweiterungenOf(prefix)).not.toBeNull();
      s.removeAusp('m/bet', id);
      expect(s.erweiterungenOf(prefix)).toBeNull();
    });
  });

  describe('Schema-Erweiterungen', () => {
    it('addErweiterung haengt an und liefert die id (neue Map-Referenz)', () => {
      const before = s.erweiterungen();
      const id = s.addErweiterung('m/a', { name: 'zusatz', min: '0', max: '1', datentyp: 'string' });
      expect(s.erweiterungen()).not.toBe(before);
      const list = s.erweiterungenOf('m/a')!;
      expect(list.length).toBe(1);
      expect(list[0]!.id).toBe(id);
      expect(list[0]!.name).toBe('zusatz');
    });

    it('updateErweiterung patcht Felder und erzeugt neue Referenzen', () => {
      const id = s.addErweiterung('m/a', { name: 'zusatz', min: '1', max: '1' });
      const before = s.erweiterungenOf('m/a');
      s.updateErweiterung('m/a', id, { name: 'neu', datentyp: 'date' });
      expect(s.erweiterungenOf('m/a')).not.toBe(before);
      expect(s.erweiterungenOf('m/a')![0]).toEqual(
        jasmine.objectContaining({ id, name: 'neu', datentyp: 'date' }),
      );
    });

    it('removeErweiterung raeumt kaskadierend ueber alle drei Maps auf', () => {
      const id = s.addErweiterung('m/a', { name: 'container', min: '1', max: '1' });
      const pfad = 'm/a/~' + id;
      // Unter-Erweiterung, Profil-Eintraege, Auspraegung, Auswahl und Oeffnung.
      const kindId = s.addErweiterung(pfad, { name: 'kind', min: '1', max: '1', datentyp: 'string' });
      s.setElementProfile(pfad, { status: 's1' });
      s.setElementProfile(pfad + '/~' + kindId, { beispiel: 'x' });
      s.auspraegungen.update((m) => ({ ...m, [pfad]: [{ id: 'a1', name: 'A' }] }));
      s.selItem.set({ kind: 'el', node: node(pfad) } as TreeItem);
      s.setOpen(pfad, true);

      s.removeErweiterung('m/a', id);

      expect(s.erweiterungenOf('m/a')).toBeNull();
      expect(s.erweiterungenOf(pfad)).toBeNull();
      expect(s.elemente()[pfad]).toBeUndefined();
      expect(s.elemente()[pfad + '/~' + kindId]).toBeUndefined();
      expect(s.auspraegungen()[pfad]).toBeUndefined();
      expect(s.selItem()).toBeNull();
      expect(s.isOpen(pfad)).toBeFalse();
    });

    it('removeErweiterung laesst Geschwister stehen', () => {
      const a = s.addErweiterung('m/a', { name: 'eins', min: '1', max: '1' });
      const b = s.addErweiterung('m/a', { name: 'zwei', min: '1', max: '1' });
      s.removeErweiterung('m/a', a);
      expect(s.erweiterungenOf('m/a')!.map((e) => e.id)).toEqual([b]);
    });

    it('duplicateElement nimmt direkt unterliegende Erweiterungen mit in Fall 1', () => {
      s.addErweiterung('m/bet', { name: 'zusatz', min: '1', max: '1', datentyp: 'string' });
      s.duplicateElement('m/bet');
      const [fall1] = s.auspsOf('m/bet')!;
      expect(s.erweiterungenOf('m/bet')).toBeNull();
      const verschoben = s.erweiterungenOf('m/bet@' + fall1!.id)!;
      expect(verschoben.map((e) => e.name)).toEqual(['zusatz']);
    });

    it('copyAusp kopiert Erweiterungen der Auspraegung mit (eigene Objekt-Kopien)', () => {
      const a = s.addAusp('m/bet', 'A');
      s.addErweiterung('m/bet@' + a, { name: 'zusatz', min: '1', max: '1' });
      s.copyAusp('m/bet', a);
      const kopie = s.auspsOf('m/bet')!.find((x) => x.id !== a)!;
      const list = s.erweiterungenOf('m/bet@' + kopie.id)!;
      expect(list.map((e) => e.name)).toEqual(['zusatz']);
      expect(list[0]).not.toBe(s.erweiterungenOf('m/bet@' + a)![0]);
    });

    it('profileDoc enthaelt die Erweiterungen; loadProfile stellt sie wieder her', () => {
      s.addErweiterung('m/a', { name: 'zusatz', min: '1', max: '1' });
      const doc = s.profileDoc();
      expect(Object.keys(doc.erweiterungen)).toEqual(['m/a']);
      s.resetProfile();
      expect(s.erweiterungenOf('m/a')).toBeNull();
      s.loadProfile(doc);
      expect(s.erweiterungenOf('m/a')!.map((e) => e.name)).toEqual(['zusatz']);
    });

    it('fortschritt zaehlt nErw ueber alle Ebenen', () => {
      const id = s.addErweiterung('m/a', { name: 'c', min: '1', max: '1' });
      s.addErweiterung('m/a/~' + id, { name: 'k', min: '1', max: '1', datentyp: 'string' });
      expect(s.fortschritt().nErw).toBe(2);
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

  describe('Zwingend-Vorbelegung', () => {
    it('pflichtStatus findet die Stufe mit Wirkung pflicht', () => {
      expect(s.pflichtStatus()?.id).toBe('s1');
      expect(s.pflichtStatus()?.wirkung).toBe('pflicht');
    });

    it('optionalStatus findet die Stufe mit Wirkung optional; null wenn keine existiert', () => {
      expect(s.optionalStatus()?.id).toBe('s2');
      expect(s.optionalStatus()?.wirkung).toBe('optional');
      s.setStatuses(s.statuses().filter((x) => x.wirkung !== 'optional'));
      expect(s.optionalStatus()).toBeNull();
    });

    it('prefillStatus setzt nur Pfade ohne Status und meldet die Anzahl', () => {
      s.setElementProfile('m/a', { status: 's3' }); // bereits gesetzt
      s.setElementProfile('m/b', { anmerkung: 'nur Notiz' }); // Status frei

      const n = s.prefillStatus(['m/a', 'm/b', 'm/c'], 's1');

      expect(n).toBe(2);
      expect(s.statusOf('m/a')?.id).toBe('s3'); // nicht ueberschrieben
      expect(s.statusOf('m/b')?.id).toBe('s1');
      expect(s.elemente()['m/b']?.anmerkung).toBe('nur Notiz'); // Feld erhalten
      expect(s.statusOf('m/c')?.id).toBe('s1');
    });

    it('prefillStatus ist idempotent und feuert nur bei Aenderung', () => {
      s.prefillStatus(['m/a'], 's1');
      const before = s.elemente();
      const n = s.prefillStatus(['m/a'], 's1');
      expect(n).toBe(0);
      expect(s.elemente()).toBe(before); // keine neue Referenz
    });
  });

  describe('fortschritt', () => {
    it('zaehlt Festlegungen und Ausprägungen', () => {
      s.setElementProfile('m/a', { status: 's1' });
      s.setElementProfile('m/b', { anmerkung: 'nur Notiz' }); // kein Status
      s.addAusp('m/bet');
      expect(s.fortschritt()).toEqual({ nStatus: 1, nAusp: 1, nErw: 0 });
    });
  });

  describe('boxHidden (nur Werte)', () => {
    it('zeigt ohne onlyValues alles', () => {
      expect(s.boxHidden('m/a/b')).toBe(false);
    });

    it('blendet im onlyValues-Modus Wertlose aus, Werte + Vorfahren bleiben', () => {
      s.setElementProfile('m/gds/kopf/az', { beispiel: '12345' });
      s.onlyValues.set(true);
      // Blatt mit Wert und alle Vorfahren sichtbar.
      expect(s.boxHidden('m/gds/kopf/az')).toBe(false);
      expect(s.boxHidden('m/gds/kopf')).toBe(false);
      expect(s.boxHidden('m/gds')).toBe(false);
      // Geschwister ohne Wert ausgeblendet.
      expect(s.boxHidden('m/gds/kopf/leer')).toBe(true);
      expect(s.boxHidden('m/anderer')).toBe(true);
    });

    it('zaehlt auch Anmerkung/Codelisten-Werte als Inhalt', () => {
      s.setElementProfile('m/note', { anmerkung: 'x' });
      s.setElementProfile('m/code', { werte: ['1'] });
      s.onlyValues.set(true);
      expect(s.boxHidden('m/note')).toBe(false);
      expect(s.boxHidden('m/code')).toBe(false);
    });
  });

  describe('Hinweise (interne Review-Notizen)', () => {
    it('Eintrag mit nur Hinweis ueberlebt das Prune', () => {
      s.setElementProfile('m/a', { hinweis: 'pruefen' });
      expect(s.elemente()['m/a']).toEqual({ hinweis: 'pruefen' });
    });

    it('Leeren des Hinweistexts raeumt den Eintrag weg — auch mit Erledigt-Flag', () => {
      s.setElementProfile('m/a', { hinweis: 'pruefen', hinweisErledigt: true });
      s.setElementProfile('m/a', { hinweis: undefined, hinweisErledigt: undefined });
      expect(s.elemente()['m/a']).toBeUndefined();
    });

    it('hinweisErledigt allein haelt keinen Eintrag am Leben', () => {
      s.setElementProfile('m/a', { hinweisErledigt: true });
      expect(s.elemente()['m/a']).toBeUndefined();
    });

    it('hinweisEintraege sortiert offene vor erledigten, nOffeneHinweise zaehlt nur offene', () => {
      s.setElementProfile('m/b', { hinweis: 'fertig', hinweisErledigt: true });
      s.setElementProfile('m/c', { hinweis: 'offen2' });
      s.setElementProfile('m/a', { hinweis: 'offen1' });
      expect(s.hinweisEintraege().map((e) => e.pfad)).toEqual(['m/a', 'm/c', 'm/b']);
      expect(s.nOffeneHinweise()).toBe(2);
    });

    it('hinweisAnc zaehlt offene Hinweise auf allen Vorfahren (Grenzen / und @)', () => {
      s.setElementProfile('m/bet@a1/rolle', { hinweis: 'x' });
      s.setElementProfile('m/bet@a1/name', { hinweis: 'y', hinweisErledigt: true });
      const anc = s.hinweisAnc();
      expect(anc.get('m')).toBe(1);
      expect(anc.get('m/bet')).toBe(1);
      expect(anc.get('m/bet@a1')).toBe(1);
      expect(anc.get('m/bet@a1/rolle')).toBeUndefined();
    });

    it('hasNotes bleibt false bei nur-Hinweis (t-note getrennt vom Hinweis-Badge)', () => {
      s.setElementProfile('m/a', { hinweis: 'x' });
      expect(s.hasNotes('m/a')).toBeFalse();
    });

    it('boxHidden zeigt im nur-Werte-Modus Elemente mit Hinweis samt Vorfahren', () => {
      s.setElementProfile('m/gds/kopf/az', { hinweis: 'pruefen' });
      s.onlyValues.set(true);
      expect(s.boxHidden('m/gds/kopf/az')).toBe(false);
      expect(s.boxHidden('m/gds')).toBe(false);
    });

    it('duplicateElement nimmt den Hinweis mit nach Fall 1 (dokumentiertes Verhalten)', () => {
      s.setElementProfile('m/bet/rolle', { hinweis: 'x' });
      s.duplicateElement('m/bet');
      const id1 = s.auspsOf('m/bet')![0]!.id;
      expect(s.elemente()['m/bet@' + id1 + '/rolle']).toEqual({ hinweis: 'x' });
    });
  });

  describe('expandValueBranches', () => {
    it('klappt jeden Wert samt seiner Vorfahren auf', () => {
      s.setElementProfile('m/gds/kopf/az', { beispiel: '12345' });
      s.expandValueBranches();
      expect(s.isOpen('m/gds/kopf/az')).toBeTrue();
      expect(s.isOpen('m/gds/kopf')).toBeTrue();
      expect(s.isOpen('m/gds')).toBeTrue();
      expect(s.isOpen('m')).toBeTrue();
    });

    it('laesst bereits offene Aeste stehen und macht ohne Werte nichts', () => {
      s.setOpen('m/x', true);
      const before = s.open();
      s.expandValueBranches(); // keine Werte
      expect(s.open()).toBe(before);
      expect(s.isOpen('m/x')).toBeTrue();
    });
  });

  describe('loadProfile / Betrachtungsmodus', () => {
    it('setzt readOnly und onlyValues beim Laden eines Profils zurueck', () => {
      s.readOnly.set(true);
      s.onlyValues.set(true);
      s.loadProfile({ meta: {}, statuses: [], elemente: {}, auspraegungen: {}, erweiterungen: {} });
      expect(s.readOnly()).toBeFalse();
      expect(s.onlyValues()).toBeFalse();
    });

    it('laesst guided beim Profil-Reset unangetastet (Nachrichtenwahl im gefuehrten Modus)', () => {
      s.guided.set(true);
      s.loadProfile({ meta: {}, statuses: [], elemente: {}, auspraegungen: {}, erweiterungen: {} });
      expect(s.guided()).toBeTrue();
    });

    it('raeumt die Validierungsmarker des vorherigen Prueflaufs', () => {
      s.valFehler.set(new Map([['m/a', ['Fehler']]]));
      s.valAnc.set(new Map([['m', 1]]));
      s.loadProfile({ meta: {}, statuses: [], elemente: {}, auspraegungen: {}, erweiterungen: {} });
      expect(s.valFehler()).toBeNull();
      expect(s.valAnc()).toBeNull();
    });
  });
});
