import { TestBed } from '@angular/core/testing';
import { ProfileStoreService } from './profile-store.service';
import { ProfileDoc } from '../../models/profile.model';
import { defaultStatuses } from '../profile-defaults';

function doc(over: Partial<ProfileDoc> = {}): ProfileDoc {
  return {
    meta: { name: 'Test', nachricht: 'nachricht.test.0001', xjustizVersion: '3.6.2' },
    statuses: defaultStatuses(),
    elemente: { 'nachricht.test.0001/datum': { status: 's1' } },
    auspraegungen: { 'nachricht.test.0001/beteiligter': [{ id: 'a1', name: 'Kläger' }] },
    ...over,
  };
}

describe('ProfileStoreService', () => {
  let store: ProfileStoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ProfileStoreService);
  });

  afterEach(() => localStorage.clear());

  it('create/load: legt ein Profil an und liest es zurück', () => {
    const id = store.create(doc());
    expect(id).toBeTruthy();
    const back = store.load(id);
    expect(back?.meta.name).toBe('Test');
    expect(back?.elemente['nachricht.test.0001/datum']?.status).toBe('s1');
  });

  it('upsert: leitet den Fortschritt-Snapshot aus dem Dokument ab', () => {
    const id = store.create(doc());
    const e = store.entries().find((x) => x.id === id)!;
    expect(e.nStatus).toBe(1);
    expect(e.nAusp).toBe(1);
    expect(e.nachricht).toBe('nachricht.test.0001');
    expect(e.xjustizVersion).toBe('3.6.2');
  });

  it('entries: reaktiv und nach letzter Schreibung absteigend', () => {
    const id1 = store.create(doc({ meta: { name: 'A' } }));
    const id2 = store.create(doc({ meta: { name: 'B' } }));
    expect(store.entries().map((e) => e.id)).toEqual([id2, id1]);
    store.upsert(id1, doc({ meta: { name: 'A2' } }));
    expect(store.entries()[0]!.id).toBe(id1);
  });

  it('duplicate: neue id, Name mit "(Kopie)", eigenständiges Dokument', () => {
    const id = store.create(doc({ meta: { name: 'Original' } }));
    const copyId = store.duplicate(id)!;
    expect(copyId).not.toBe(id);
    expect(store.load(copyId)?.meta.name).toBe('Original (Kopie)');
    expect(store.load(id)?.meta.name).toBe('Original');
  });

  it('rename: ändert nur den Namen', () => {
    const id = store.create(doc());
    store.rename(id, '  Neuer Name  ');
    expect(store.load(id)?.meta.name).toBe('Neuer Name');
    expect(store.entries().find((e) => e.id === id)?.name).toBe('Neuer Name');
  });

  it('delete: entfernt Dokument und Indexeintrag', () => {
    const id = store.create(doc());
    store.delete(id);
    expect(store.load(id)).toBeNull();
    expect(store.entries().find((e) => e.id === id)).toBeUndefined();
  });

  it('migrateLegacyAutosave: hebt einen alten Autosave-Slot in die Bibliothek', () => {
    localStorage.setItem(
      'xjp.autosave',
      JSON.stringify({
        t: 1,
        msgName: 'nachricht.test.0001',
        version: '3.6.2',
        meta: { name: 'Altstand' },
        statuses: defaultStatuses(),
        elemente: { 'nachricht.test.0001/datum': { status: 's1' } },
        auspraegungen: {},
        name: 'Altstand',
      }),
    );
    const id = store.migrateLegacyAutosave()!;
    expect(id).toBeTruthy();
    const migr = store.load(id)!;
    expect(migr.meta.name).toBe('Altstand');
    expect(migr.meta.nachricht).toBe('nachricht.test.0001');
    expect(migr.meta.xjustizVersion).toBe('3.6.2');
    expect(localStorage.getItem('xjp.autosave')).toBeNull();
  });

  it('migrateLegacyAutosave: no-op bei bereits vorhandener Bibliothek', () => {
    store.create(doc());
    localStorage.setItem('xjp.autosave', JSON.stringify({ elemente: { x: { status: 's1' } } }));
    expect(store.migrateLegacyAutosave()).toBeNull();
  });
});
