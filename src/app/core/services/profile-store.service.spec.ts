import { TestBed } from '@angular/core/testing';
import { ProfileStoreService } from './profile-store.service';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';

/** Ein minimales ProfileDoc fuer die Tests. */
function doc(name = 'P'): ProfileDoc {
  return { meta: { name }, statuses: [], elemente: {}, auspraegungen: {}, erweiterungen: {} };
}

/** Ein LibraryEntry-Stub. */
function entry(id: string, over: Partial<LibraryEntry> = {}): LibraryEntry {
  return { id, name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 1000, ...over };
}

describe('ProfileStoreService (HTTP)', () => {
  let store: ProfileStoreService;
  let handlers: Record<string, (init?: RequestInit) => Response>;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    handlers = { 'GET api/profiles': () => json([]) }; // Default: Constructor-refresh
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      const method = (init?.method || 'GET').toUpperCase();
      const h = handlers[`${method} ${url}`];
      return Promise.resolve(
        h ? h(init) : new Response('not mocked: ' + method + ' ' + url, { status: 500 }),
      );
    });
    TestBed.configureTestingModule({});
    store = TestBed.inject(ProfileStoreService);
  });

  it('refresh laedt den Index und sortiert absteigend', async () => {
    handlers['GET api/profiles'] = () =>
      json([entry('a', { aktualisiert: 100 }), entry('b', { aktualisiert: 200 })]);
    await store.refresh();
    expect(store.entries().map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('create sendet POST und pflegt den neuen Eintrag ein', async () => {
    handlers['POST api/profiles'] = () =>
      json({ id: 'neu', entry: entry('neu', { name: 'Neu', aktualisiert: 500 }) }, 201);
    const id = await store.create(doc('Neu'));
    expect(id).toBe('neu');
    expect(store.entries()[0]).toEqual(entry('neu', { name: 'Neu', aktualisiert: 500 }));
  });

  it('upsert aktualisiert den Eintrag ohne Duplikat', async () => {
    handlers['GET api/profiles'] = () => json([entry('x', { aktualisiert: 100 })]);
    await store.refresh();
    handlers['PUT api/profiles/x'] = () =>
      json({ entry: entry('x', { name: 'Geaendert', aktualisiert: 900 }) });
    await store.upsert('x', doc('Geaendert'));
    expect(store.entries().length).toBe(1);
    expect(store.entries()[0]!.name).toBe('Geaendert');
  });

  it('load liefert das Dokument bzw. null bei 404', async () => {
    handlers['GET api/profiles/x'] = () => json(doc('Geladen'));
    expect((await store.load('x'))?.meta.name).toBe('Geladen');
    handlers['GET api/profiles/fehlt'] = () => new Response(null, { status: 404 });
    expect(await store.load('fehlt')).toBeNull();
  });

  it('duplicate liefert neue id bzw. null bei 404', async () => {
    handlers['POST api/profiles/x/duplicate'] = () =>
      json({ id: 'kopie', entry: entry('kopie', { name: 'P (Kopie)', aktualisiert: 700 }) }, 201);
    expect(await store.duplicate('x')).toBe('kopie');
    expect(store.entries()[0]!.id).toBe('kopie');
    handlers['POST api/profiles/fehlt/duplicate'] = () => new Response(null, { status: 404 });
    expect(await store.duplicate('fehlt')).toBeNull();
  });

  it('rename patcht den Namen', async () => {
    handlers['PATCH api/profiles/x'] = () =>
      json({ entry: entry('x', { name: 'Umbenannt', aktualisiert: 800 }) });
    await store.rename('x', 'Umbenannt');
    expect(store.entries()[0]).toEqual(entry('x', { name: 'Umbenannt', aktualisiert: 800 }));
  });

  it('delete entfernt den Eintrag (204)', async () => {
    handlers['GET api/profiles'] = () => json([entry('x'), entry('y')]);
    await store.refresh();
    handlers['DELETE api/profiles/x'] = () => new Response(null, { status: 204 });
    await store.delete('x');
    expect(store.entries().map((e) => e.id)).toEqual(['y']);
  });

  it('importAll meldet die Anzahl', async () => {
    handlers['POST api/import'] = () => json({ imported: 2 });
    const n = await store.importAll([
      { id: 'a', doc: doc(), aktualisiert: 1 },
      { id: 'b', doc: doc(), aktualisiert: 2 },
    ]);
    expect(n).toBe(2);
  });

  it('listVersions liefert die Versionsliste', async () => {
    handlers['GET api/profiles/x/versions'] = () =>
      json([{ id: 'v2', nr: 2, erstellt: 200 }, { id: 'v1', nr: 1, kommentar: 'k', automatisch: true, erstellt: 100 }]);
    const liste = await store.listVersions('x');
    expect(liste.map((v) => v.nr)).toEqual([2, 1]);
    expect(liste[1]!.automatisch).toBeTrue();
  });

  it('createVersion legt an und pflegt den Entry ein', async () => {
    handlers['POST api/profiles/x/versions'] = () =>
      json(
        {
          version: { id: 'v1', nr: 1, kommentar: 'k', erstellt: 100 },
          entry: entry('x', { nVersionen: 1, letzteVersionNr: 1, aktualisiert: 900 }),
        },
        201,
      );
    const out = await store.createVersion('x', { kommentar: 'k' });
    expect(out.version?.nr).toBe(1);
    expect(store.entries()[0]!.nVersionen).toBe(1);
  });

  it('createVersion meldet entprellte Automatik-Version als skipped', async () => {
    handlers['POST api/profiles/x/versions'] = () =>
      json({ skipped: true, entry: entry('x', { nVersionen: 1, letzteVersionNr: 1 }) });
    const out = await store.createVersion('x', { automatisch: true });
    expect(out.skipped).toBeTrue();
    expect(out.version).toBeUndefined();
  });

  it('restoreVersion liefert das Dokument und aktualisiert den Entry', async () => {
    handlers['POST api/profiles/x/versions/v1/restore'] = () =>
      json({ entry: entry('x', { name: 'Alt', nVersionen: 2, letzteVersionNr: 2, aktualisiert: 950 }), doc: doc('Alt') });
    const restored = await store.restoreVersion('x', 'v1');
    expect(restored.meta.name).toBe('Alt');
    expect(store.entries()[0]!.letzteVersionNr).toBe(2);
    expect(store.entries()[0]!.geaendert).toBeUndefined();
  });

  it('deleteVersion sendet DELETE (204)', async () => {
    let aufgerufen = false;
    handlers['DELETE api/profiles/x/versions/v1'] = () => {
      aufgerufen = true;
      return new Response(null, { status: 204 });
    };
    await store.deleteVersion('x', 'v1');
    expect(aufgerufen).toBeTrue();
  });

  it('wirft bei Fehlerstatus (nicht ok)', async () => {
    handlers['PUT api/profiles/x'] = () => new Response('boom', { status: 500 });
    await expectAsync(store.upsert('x', doc())).toBeRejectedWithError(/500/);
  });
});
