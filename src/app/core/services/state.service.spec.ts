import { TestBed } from '@angular/core/testing';
import { StateService } from './state.service';
import { HinweisStoreService } from './hinweis-store.service';
import { TreeItem, TreeNode } from '../../models/node.model';
import { ProfileDoc } from '../../models/profile.model';
import { newProfile } from '../profile-defaults';

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

    it('inheritedExcluded erbt ueber die Vorkommen-Grenze hinweg', () => {
      // Der Traegerknoten `m/bet` steht in keinem '/'-Praefix von `m/bet@a1/…`;
      // ohne die '@'-Grenze bliebe sein Ausschluss an den Vorkommen wirkungslos.
      s.setElementProfile('m/bet', { status: 's3' });
      expect(s.inheritedExcluded('m/bet@a1')).toBeTrue();
      expect(s.inheritedExcluded('m/bet@a1/name')).toBeTrue();
      expect(s.inheritedExcluded('m/andere@a1/name')).toBeFalse();
    });

    it('effKard beruecksichtigt Overrides', () => {
      const n = node('m/a', { min: '0', max: 'unbounded' });
      expect(s.effKard(n)).toEqual({
        min: '0',
        max: 'unbounded',
        changed: false,
        minProfil: false,
        maxProfil: false,
      });
      s.setElementProfile('m/a', { max: '1' });
      expect(s.effKard(n)).toEqual({
        min: '0',
        max: '1',
        changed: true,
        minProfil: false,
        maxProfil: true,
      });
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
      const id = s.addErweiterung('m/a', {
        name: 'zusatz',
        min: '0',
        max: '1',
        datentyp: 'string',
      });
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
      const kindId = s.addErweiterung(pfad, {
        name: 'kind',
        min: '1',
        max: '1',
        datentyp: 'string',
      });
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

    it('closeSubtree entfernt den Knoten selbst und alle Nachfahren', () => {
      s.open.set(new Set(['m', 'm/a', 'm/a/b', 'm/a/b/c', 'm/ab', 'm/x']));
      s.closeSubtree('m/a');
      expect([...s.open()].sort()).toEqual(['m', 'm/ab', 'm/x']);
    });

    it('closeSubtree erfasst Auspraegungspfade (@) mit', () => {
      s.open.set(new Set(['m', 'm/a', 'm/a@a1', 'm/a@a1/k', 'm/a/b@a2']));
      s.closeSubtree('m/a');
      expect([...s.open()].sort()).toEqual(['m']);
    });

    it('closeSubtree unter einer Auspraegung schliesst nur deren Teilbaum', () => {
      s.open.set(new Set(['m', 'm/a', 'm/a@a1', 'm/a@a1/k', 'm/a@a2', 'm/a@a2/k']));
      s.closeSubtree('m/a@a1');
      expect([...s.open()].sort()).toEqual(['m', 'm/a', 'm/a@a2', 'm/a@a2/k']);
    });

    it('closeSubtree ohne betroffene Pfade laesst das Set-Objekt unveraendert', () => {
      s.open.set(new Set(['m']));
      const before = s.open();
      s.closeSubtree('m/a');
      expect(s.open()).toBe(before);
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

    it('haelt den Traegerknoten einer Auspraegung sichtbar (Werte in Vorkommen)', () => {
      // Import mehrfach vorkommender Elemente legt Auspraegungen an; die Werte
      // haengen unter '…/beteiligung@<id>/…'. Ohne den Traegerknoten
      // '…/beteiligung' waere der ganze Ast im Baum ausgeblendet.
      s.setElementProfile('m/gds/verf/beteiligung@a1/rolle/nr', { beispiel: '1' });
      s.onlyValues.set(true);
      expect(s.boxHidden('m/gds/verf/beteiligung@a1/rolle/nr')).toBe(false);
      expect(s.boxHidden('m/gds/verf/beteiligung@a1/rolle')).toBe(false);
      expect(s.boxHidden('m/gds/verf/beteiligung@a1')).toBe(false);
      expect(s.boxHidden('m/gds/verf/beteiligung')).toBe(false);
      expect(s.boxHidden('m/gds/verf')).toBe(false);
      expect(s.boxHidden('m/gds/verf/leer')).toBe(true);
    });

    it('zeigt ohne onlyValues auch unbelegte Elemente (Voraussetzung fuers Hinzufuegen)', () => {
      s.setElementProfile('m/gds/kopf/az', { beispiel: '12345' });
      s.onlyValues.set(false);
      expect(s.boxHidden('m/gds/kopf/leer')).toBe(false);
    });
  });

  describe('nachrichtBearbeiten (Betrachten <-> Bearbeiten)', () => {
    it('schaltet readOnly und onlyValues gemeinsam um', () => {
      s.readOnly.set(true);
      s.onlyValues.set(true);
      s.nachrichtBearbeiten(true);
      expect(s.readOnly()).toBeFalse();
      expect(s.onlyValues()).toBeFalse();
      s.nachrichtBearbeiten(false);
      expect(s.readOnly()).toBeTrue();
      expect(s.onlyValues()).toBeTrue();
    });

    it('verweigert das Bearbeiten bei Abnahme-Schreibschutz', () => {
      s.readOnly.set(true);
      s.onlyValues.set(true);
      s.abnahmeSchreibschutz.set(true);
      s.nachrichtBearbeiten(true);
      expect(s.readOnly()).toBeTrue();
      expect(s.onlyValues()).toBeTrue();
    });
  });

  describe('Hinweise (eigene Ressource)', () => {
    /** Hinweise liegen im HinweisStoreService, nicht im Profil-Dokument. */
    let hinweise: HinweisStoreService;

    beforeEach(() => {
      hinweise = TestBed.inject(HinweisStoreService);
    });

    it('gehoeren nicht zum Elementprofil — ein Eintrag ohne andere Felder faellt weg', () => {
      s.setElementProfile('m/a', { anmerkung: 'x' });
      s.setElementProfile('m/a', { anmerkung: undefined });
      expect(s.elemente()['m/a']).toBeUndefined();
      hinweise.hinweise.set([{ id: 'h1', pfad: 'm/a', text: 'pruefen', zeit: 1 }]);
      // Der Hinweis haelt keinen Eintrag in `elemente` am Leben.
      expect(s.elemente()['m/a']).toBeUndefined();
    });

    it('hasNotes bleibt false bei nur-Hinweis (t-note getrennt vom Hinweis-Badge)', () => {
      hinweise.hinweise.set([{ id: 'h1', pfad: 'm/a', text: 'x', zeit: 1 }]);
      expect(s.hasNotes('m/a')).toBeFalse();
    });

    it('boxHidden zeigt im nur-Werte-Modus Elemente mit Hinweis samt Vorfahren', () => {
      hinweise.hinweise.set([{ id: 'h1', pfad: 'm/gds/kopf/az', text: 'pruefen', zeit: 1 }]);
      s.onlyValues.set(true);
      expect(s.boxHidden('m/gds/kopf/az')).toBe(false);
      expect(s.boxHidden('m/gds')).toBe(false);
    });

    it('removeAusp raeumt die Hinweise des Vorkommens mit ab', () => {
      // Ohne die Kaskade blieben sie in der eigenen Ablage zurueck: sie zaehlten
      // weiter, standen in der Uebersicht und erzeugten einen Sammel-Marker,
      // dessen Sprung ins Leere geht.
      const weg = spyOn(hinweise, 'loescheUnter').and.resolveTo();
      const id = s.addAusp('m/bet', 'Notar');
      s.removeAusp('m/bet', id);
      expect(weg).toHaveBeenCalledOnceWith('m/bet@' + id);
    });

    it('removeErweiterung raeumt die Hinweise der Erweiterung mit ab', () => {
      const weg = spyOn(hinweise, 'loescheUnter').and.resolveTo();
      const id = s.addErweiterung('m/gds', {
        name: 'zusatz',
        min: '0',
        max: '1',
        datentyp: 'string',
      });
      s.removeErweiterung('m/gds', id);
      expect(weg).toHaveBeenCalledOnceWith('m/gds/~' + id);
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

  describe('Vorgabe-Schicht', () => {
    /** Ein Vorgabe-Dokument mit eigenen Statusstufen (Stufen sind je Profil frei). */
    function vorgabeDoc(over: Partial<ProfileDoc> = {}): ProfileDoc {
      return { ...newProfile(), ...over };
    }

    it('setVorgabe setzt, clearVorgabe leert die Vorgabe', () => {
      expect(s.vorgabe()).toBeNull();
      expect(s.hatVorgabe()).toBeFalse();

      s.setVorgabe(vorgabeDoc({ elemente: { 'm/a': { status: 's1' } } }));

      expect(s.hatVorgabe()).toBeTrue();
      expect(s.vorgabe()!.elemente['m/a']).toEqual({ status: 's1' });

      s.clearVorgabe();

      expect(s.vorgabe()).toBeNull();
      expect(s.hatVorgabe()).toBeFalse();
    });

    it('Wirkung: Entscheidung vor Vorgabe, Vorgabe-Status ueber deren eigene Stufen', () => {
      s.setVorgabe(
        vorgabeDoc({
          // Eigene Stufenliste mit anderen ids als der Entscheidungsstand.
          statuses: [
            { id: 'v1', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
          ],
          elemente: { 'm/a': { status: 'v1' }, 'm/b': { status: 'v1' } },
        }),
      );
      s.setElementProfile('m/a', { status: 's1' }); // Entscheidung: zwingend

      expect(s.wirkungOf('m/a')).toBe('pflicht');
      expect(s.statusOf('m/a')?.id).toBe('s1');
      expect(s.wirkungOf('m/b')).toBe('ausgeschlossen');
      expect(s.statusOf('m/b')?.name).toBe('nicht verwendet');
      expect(s.wirkungOf('m/c')).toBeNull();
      expect(s.statusOf('m/c')).toBeNull();
    });

    it('Kardinalitaet: Entscheidung vor Vorgabe, sonst Schema', () => {
      const n = node('m/a', { min: '0', max: 'unbounded' });
      const ohne = node('m/b', { min: '0', max: '1' });
      s.setVorgabe(vorgabeDoc({ elemente: { 'm/a': { min: '1', max: '3' } } }));

      // Die Quelle je Grenze wird mitgefuehrt (Begruendung der Sperren im Durchlauf).
      expect(s.effKard(n)).toEqual({
        min: '1',
        max: '3',
        changed: true,
        minProfil: true,
        maxProfil: true,
      });
      expect(s.effKard(ohne)).toEqual({
        min: '0',
        max: '1',
        changed: false,
        minProfil: false,
        maxProfil: false,
      });

      s.setElementProfile('m/a', { max: '2' });
      expect(s.effKard(n)).toEqual({
        min: '1',
        max: '2',
        changed: true,
        minProfil: true,
        maxProfil: true,
      });
    });

    it('Auspraegungen: Entscheidung vor Vorgabe, je Pfad als ganze Liste', () => {
      s.setVorgabe(
        vorgabeDoc({
          auspraegungen: {
            'm/bet': [{ id: 'v1', name: 'Notar/in' }],
            'm/anlage': [{ id: 'v2', name: 'Urkunde' }],
          },
        }),
      );

      expect(s.auspsOf('m/bet')!.map((a) => a.name)).toEqual(['Notar/in']);
      expect(s.auspsOf('m/anlage')!.map((a) => a.name)).toEqual(['Urkunde']);
      expect(s.auspsOf('m/sonst')).toBeNull();
    });

    it('addAusp materialisiert die Vorgabe-Liste, statt sie zu verdecken', () => {
      s.setVorgabe(vorgabeDoc({ auspraegungen: { 'm/bet': [{ id: 'v1', name: 'Notar/in' }] } }));

      s.addAusp('m/bet', 'Betroffene Person');

      // Der Rueckfall gilt je Pfad fuer die ganze Liste — ohne Materialisierung
      // verschwaende das Vorkommen der Profilierung aus Baum und Instanz.
      expect(s.auspsOf('m/bet')!.map((a) => a.name)).toEqual(['Notar/in', 'Betroffene Person']);
      expect(s.vorgabe()!.auspraegungen['m/bet']!.map((a) => a.name)).toEqual(['Notar/in']);
    });

    it('removeAusp und renameAusp greifen auch auf einer Liste der Vorgabe', () => {
      s.setVorgabe(
        vorgabeDoc({
          auspraegungen: {
            'm/bet': [
              { id: 'v1', name: 'Notar/in' },
              { id: 'v2', name: 'Betroffene Person' },
            ],
          },
        }),
      );

      s.renameAusp('m/bet', 'v2', 'Beteiligte Person');
      expect(s.auspsOf('m/bet')!.map((a) => a.name)).toEqual(['Notar/in', 'Beteiligte Person']);

      s.removeAusp('m/bet', 'v1');
      expect(s.auspsOf('m/bet')!.map((a) => a.id)).toEqual(['v2']);

      // Die geleerte eigene Liste faellt nicht auf die Vorgabe zurueck — sonst
      // kaemen die entfernten Vorkommen mit dem naechsten Lesezugriff wieder.
      s.removeAusp('m/bet', 'v2');
      expect(s.auspsOf('m/bet')).toEqual([]);
      // Die eingefrorene Kopie bleibt unangetastet.
      expect(s.vorgabe()!.auspraegungen['m/bet']!.map((a) => a.name)).toEqual([
        'Notar/in',
        'Betroffene Person',
      ]);
    });

    it('Codelisten-Werte: Entscheidung vor Vorgabe; leere Liste bleibt Einschraenkung', () => {
      s.setVorgabe(
        vorgabeDoc({ elemente: { 'm/rolle': { werte: ['01', '02'] }, 'm/art': { werte: ['A'] } } }),
      );

      expect(s.werteOf('m/rolle')).toEqual(['01', '02']);
      expect(s.werteOf('m/ohne')).toBeNull();

      s.setElementProfile('m/rolle', { werte: ['01'] });
      expect(s.werteOf('m/rolle')).toEqual(['01']);

      // Leeres Array ist eine bewusste Einschraenkung („keine Werte zugelassen")
      // und faellt nicht auf die Vorgabe zurueck.
      s.setElementProfile('m/art', { werte: [] });
      expect(s.werteOf('m/art')).toEqual([]);
    });

    it('Anmerkung: Entscheidung vor Vorgabe', () => {
      s.setVorgabe(
        vorgabeDoc({
          elemente: { 'm/a': { anmerkung: 'aus dem Profil' }, 'm/b': { anmerkung: 'Hilfetext' } },
        }),
      );
      s.setElementProfile('m/a', { anmerkung: 'im Durchlauf notiert' });

      expect(s.anmerkungOf('m/a')).toBe('im Durchlauf notiert');
      expect(s.anmerkungOf('m/b')).toBe('Hilfetext');
      expect(s.anmerkungOf('m/c')).toBeNull();
    });

    it('Beispielwert: Entscheidung vor Vorgabe', () => {
      s.setVorgabe(
        vorgabeDoc({
          elemente: { 'm/az': { beispiel: '1 C 234/25' }, 'm/datum': { beispiel: '2025-01-01' } },
        }),
      );
      s.setElementProfile('m/az', { beispiel: '9 O 1/26' });

      expect(s.beispielOf('m/az')).toBe('9 O 1/26');
      expect(s.beispielOf('m/datum')).toBe('2025-01-01');
      expect(s.beispielOf('m/leer')).toBeNull();
    });

    it('Verweisziel: Entscheidung vor Vorgabe', () => {
      s.setVorgabe(
        vorgabeDoc({
          elemente: {
            'm/ref1': { refZiel: 'm/bet@v1' },
            'm/ref2': { refZiel: 'm/bet@v2' },
          },
        }),
      );
      s.setElementProfile('m/ref1', { refZiel: 'm/bet@eigen' });

      expect(s.refZielOf('m/ref1')).toBe('m/bet@eigen');
      expect(s.refZielOf('m/ref2')).toBe('m/bet@v2');
      expect(s.refZielOf('m/ref3')).toBeNull();
    });

    it('Schema-Erweiterungen: eigene Eintraege verdecken die Vorgabe-Liste nicht', () => {
      s.setVorgabe(
        vorgabeDoc({
          erweiterungen: { 'm/a': [{ id: 'v1', name: 'zusatzProfil', min: '1', max: '1' }] },
        }),
      );

      expect(s.erweiterungenOf('m/a')!.map((e) => e.name)).toEqual(['zusatzProfil']);

      s.addErweiterung('m/a', { name: 'zusatzDurchlauf', min: '0', max: '1' });

      // Sonst fielen die zwingenden Erweiterungen der Profilierung aus Baum und
      // Instanz — und die Nachricht waere nicht profilkonform.
      expect(s.erweiterungenOf('m/a')!.map((e) => e.name)).toEqual([
        'zusatzProfil',
        'zusatzDurchlauf',
      ]);
      expect(s.vorgabe()!.erweiterungen['m/a']!.map((e) => e.name)).toEqual(['zusatzProfil']);
    });

    it('updateErweiterung und removeErweiterung greifen auch auf einer Liste der Vorgabe', () => {
      s.setVorgabe(
        vorgabeDoc({
          erweiterungen: {
            'm/a': [
              { id: 'v1', name: 'eins', min: '1', max: '1' },
              { id: 'v2', name: 'zwei', min: '1', max: '1' },
            ],
          },
        }),
      );

      s.updateErweiterung('m/a', 'v2', { name: 'zwei neu' });
      expect(s.erweiterungenOf('m/a')!.map((e) => e.name)).toEqual(['eins', 'zwei neu']);

      s.removeErweiterung('m/a', 'v1');
      expect(s.erweiterungenOf('m/a')!.map((e) => e.id)).toEqual(['v2']);

      s.removeErweiterung('m/a', 'v2');
      expect(s.erweiterungenOf('m/a')).toEqual([]);
      expect(s.vorgabe()!.erweiterungen['m/a']!.map((e) => e.name)).toEqual(['eins', 'zwei']);
    });

    it('hasNotes erkennt Inhalt der Vorgabe (Anmerkung/Beispiel/Werte)', () => {
      s.setVorgabe(
        vorgabeDoc({
          elemente: {
            'm/a': { anmerkung: 'x' },
            'm/b': { beispiel: 'y' },
            'm/c': { werte: ['1'] },
          },
        }),
      );
      expect(s.hasNotes('m/a')).toBeTrue();
      expect(s.hasNotes('m/b')).toBeTrue();
      expect(s.hasNotes('m/c')).toBeTrue();
      expect(s.hasNotes('m/d')).toBeFalse();
    });

    it('bleibt unveraendert — weder durch Entscheidungen noch ueber das Ausgangsdokument', () => {
      const quelle = vorgabeDoc({
        elemente: { 'm/a': { status: 's1', anmerkung: 'Profil', werte: ['01'] } },
        auspraegungen: { 'm/bet': [{ id: 'v1', name: 'Notar/in' }] },
      });
      s.setVorgabe(quelle);
      const eingefroren = JSON.stringify(s.vorgabe());

      // Entscheidungen des Durchlaufs …
      s.setElementProfile('m/a', { status: 's3', anmerkung: 'anders', werte: [] });
      const id = s.addAusp('m/bet', 'Betroffene Person');
      s.removeAusp('m/bet', id);
      s.removeStatus('s1');
      // … und eine spaetere Aenderung am Ausgangsdokument (eingefrorene Kopie).
      quelle.elemente['m/a'] = { status: 'weg' };
      quelle.auspraegungen['m/bet'] = [];

      expect(JSON.stringify(s.vorgabe())).toBe(eingefroren);
    });

    it('Entscheidungsstand bleibt frei von Vorgabe-Werten (getrennt serialisierbar)', () => {
      s.setVorgabe(
        vorgabeDoc({
          meta: { name: 'Profil X' },
          elemente: { 'm/a': { status: 's1', beispiel: 'v' } },
          auspraegungen: { 'm/bet': [{ id: 'v1', name: 'Notar/in' }] },
          erweiterungen: { 'm/x': [{ id: 'x1', name: 'zusatz', min: '1', max: '1' }] },
        }),
      );
      s.setElementProfile('m/b', { beispiel: 'im Durchlauf gesetzt' });

      const doc = s.profileDoc();
      expect(Object.keys(doc.elemente)).toEqual(['m/b']);
      expect(doc.auspraegungen).toEqual({});
      expect(doc.erweiterungen).toEqual({});
      expect(doc.meta.name).toBeUndefined();
      expect(s.fortschritt()).toEqual({ nStatus: 0, nAusp: 0, nErw: 0 });
      // Die Vorgabe bleibt daneben fuer sich serialisierbar.
      expect(Object.keys(s.vorgabe()!.elemente)).toEqual(['m/a']);
    });

    it('loadProfile beendet die Bindung (jeder Profil-Einstieg raeumt die Vorgabe)', () => {
      s.setVorgabe(vorgabeDoc({ elemente: { 'm/a': { status: 's1' } } }));
      s.loadProfile(newProfile());
      expect(s.vorgabe()).toBeNull();
      expect(s.wirkungOf('m/a')).toBeNull();
    });

    it('inheritedExcluded greift auch bei ausgeschlossenem Vorfahren aus der Vorgabe', () => {
      s.setVorgabe(vorgabeDoc({ elemente: { 'm/a': { status: 's3' } } }));
      expect(s.inheritedExcluded('m/a/b/c')).toBeTrue();
      expect(s.inheritedExcluded('m/x')).toBeFalse();
    });
  });

  describe('Ausschluss durch die Vorgabe (gebundener Durchlauf)', () => {
    /** Vorgabe mit eigener Stufenliste: v9 schliesst aus. */
    function bindeVorgabe(elemente: Record<string, { status?: string }>): void {
      s.setVorgabe({
        ...newProfile(),
        statuses: [
          { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
          { id: 'v1', name: 'zwingend', farbe: '#B23B3B', wirkung: 'pflicht' },
        ],
        elemente,
      });
    }

    it('erkennt den Ausschluss der Vorgabe und vererbt ihn auf den Teilbaum', () => {
      bindeVorgabe({ 'm/a': { status: 'v9' }, 'm/b': { status: 'v1' } });

      expect(s.vorgabeGesperrt('m/a')).toBeTrue();
      expect(s.vorgabeGesperrt('m/a/kind')).toBeTrue();
      // Auch ueber die Vorkommen-Grenze hinweg (Traegerknoten der Auspraegung).
      expect(s.vorgabeGesperrt('m/a@x1/kind')).toBeTrue();
      expect(s.vorgabeGesperrt('m/b')).toBeFalse();
      expect(s.vorgabeGesperrt('m/c')).toBeFalse();
    });

    it('eine eigene Entscheidung ist keine Sperre (weglassen im Durchlauf)', () => {
      bindeVorgabe({});
      s.setElementProfile('m/a', { status: 's3' }); // im Durchlauf weggelassen

      expect(s.wirkungOf('m/a')).toBe('ausgeschlossen');
      expect(s.vorgabeGesperrt('m/a')).toBeFalse();
    });

    it('ohne Bindung gibt es keine Sperre', () => {
      s.setElementProfile('m/a', { status: 's3' });
      expect(s.vorgabeGesperrt('m/a')).toBeFalse();
      expect(s.vorgabeGesperrt('m/a/kind')).toBeFalse();
    });

    it('blendet Ausgeschlossenes aus und zeigt es erst mit "nur Profil"', () => {
      bindeVorgabe({ 'm/a': { status: 'v9' } });

      expect(s.boxHidden('m/a')).toBeTrue();
      expect(s.boxHidden('m/a/kind')).toBeTrue();
      expect(s.boxHidden('m/b')).toBeFalse();

      s.onlyProfile.set(true);
      expect(s.boxHidden('m/a')).toBeFalse();
      expect(s.boxHidden('m/a/kind')).toBeFalse();
    });

    it('im Durchlauf Weggelassenes bleibt sichtbar (die Entscheidung ist korrigierbar)', () => {
      bindeVorgabe({});
      s.setElementProfile('m/a', { status: 's3' });
      expect(s.boxHidden('m/a')).toBeFalse();
      // Auch mit "nur Profil": der Schalter zeigt Ausgeschlossenes, er versteckt
      // im gebundenen Durchlauf nichts.
      s.onlyProfile.set(true);
      expect(s.boxHidden('m/a')).toBeFalse();
    });

    it('ohne Bindung blendet "nur Profil" Ausgeschlossenes weiterhin aus', () => {
      s.setElementProfile('m/a', { status: 's3' });
      expect(s.boxHidden('m/a')).toBeFalse();
      s.onlyProfile.set(true);
      expect(s.boxHidden('m/a')).toBeTrue();
      expect(s.boxHidden('m/a/kind')).toBeTrue();
    });
  });
});
