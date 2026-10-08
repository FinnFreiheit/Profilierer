import { TestBed } from '@angular/core/testing';
import { TestmessageStoreService } from './testmessage-store.service';
import { AUTOR_STORAGE } from './autor.service';
import { TestmessageEntry, TestmessageInput } from '../../models/testmessage.model';

/**
 * Der Autor ist Pflicht und wird **im Store** angehaengt: die fuenf
 * Speicherwege (Upload, gefuehrter Durchlauf, Autosave, "als neue Nachricht",
 * Variante) sollen ihn nicht einzeln beschaffen muessen.
 */
describe('TestmessageStoreService — Autor als Pflichtangabe', () => {
  let store: TestmessageStoreService;
  let gesendet: Record<string, Record<string, unknown>>;

  /** Der Rumpf des Anlege-Requests (leer, wenn gar nicht gesendet wurde). */
  const gesendeterAutor = () => gesendet['POST api/testmessages']?.['autor'];

  const eintrag = (over: Partial<TestmessageEntry> = {}): TestmessageEntry =>
    ({
      id: 't1',
      name: 'a.xml',
      groesse: 1,
      hochgeladen: 0,
      aktualisiert: 0,
      ...over,
    }) as TestmessageEntry;

  const input = (over: Partial<TestmessageInput> = {}): TestmessageInput => ({
    name: 'a.xml',
    xml: '<nachricht.test.0001/>',
    nachricht: 'nachricht.test.0001',
    fachmodul: 'test',
    groesse: 20,
    ...over,
  });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    localStorage.removeItem(AUTOR_STORAGE);
    gesendet = {};
    spyOn(window, 'fetch').and.callFake((eingabe: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof eingabe === 'string' ? eingabe : ((eingabe as Request).url ?? String(eingabe));
      const key = `${(init?.method || 'GET').toUpperCase()} ${url}`;
      if (init?.body) gesendet[key] = JSON.parse(String(init.body));
      if (key.startsWith('POST')) return Promise.resolve(json({ id: 't1', entry: eintrag() }, 201));
      return Promise.resolve(json([]));
    });
    TestBed.configureTestingModule({});
    store = TestBed.inject(TestmessageStoreService);
  });

  afterEach(() => localStorage.removeItem(AUTOR_STORAGE));

  it('haengt den gemerkten Namen an, ohne zu fragen', async () => {
    localStorage.setItem(AUTOR_STORAGE, 'F. Freiheit');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(TestmessageStoreService);
    const frage = spyOn(window, 'prompt');
    await store.create(input());
    expect(gesendeterAutor()).toBe('F. Freiheit');
    expect(frage).not.toHaveBeenCalled();
  });

  it('fragt einmalig nach, wenn noch kein Name hinterlegt ist', async () => {
    spyOn(window, 'prompt').and.returnValue('M. Beispiel');
    await store.create(input());
    expect(gesendeterAutor()).toBe('M. Beispiel');
    expect(localStorage.getItem(AUTOR_STORAGE)).toBe('M. Beispiel');
  });

  it('ein vom Aufrufer gesetzter Autor gewinnt', async () => {
    await store.create(input({ autor: 'BLK-AG' }));
    expect(gesendeterAutor()).toBe('BLK-AG');
  });

  it('ohne Namen wird nicht angelegt — der Speicherweg bricht ab', async () => {
    spyOn(window, 'prompt').and.returnValue(null);
    await expectAsync(store.create(input())).toBeRejectedWithError(/ohne Autor/i);
    expect(gesendet['POST api/testmessages']).toBeUndefined();
  });

  it('die Variante traegt den Ersteller der Kopie mit', async () => {
    localStorage.setItem(AUTOR_STORAGE, 'F. Freiheit');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    store = TestBed.inject(TestmessageStoreService);
    await store.dupliziere('t1', 'Variante A');
    expect(gesendet['POST api/testmessages/t1/duplicate']).toEqual({
      name: 'Variante A',
      autor: 'F. Freiheit',
    });
  });
});
