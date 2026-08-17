import { TestBed } from '@angular/core/testing';
import { ProfileStoreService } from './profile-store.service';
import { RolleService } from './rolle.service';
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
      const url = typeof input === 'string' ? input : ((input as Request).url ?? String(input));
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

  // Regression: die 404-toleranten Lesepfade liefen frueher an `req` vorbei
  // und schickten den AG-Schluessel nicht mit — der Abnahme-Schutz (ADR 0012)
  // galt dort nicht. Seit dem BackendClient geht er an jeden Request.
  it('lesende Wege schicken den AG-Schluessel mit', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: RolleService, useValue: { authHeaders: () => ({ 'x-ag-key': 'geheim' }) } },
      ],
    });
    const s = TestBed.inject(ProfileStoreService);
    handlers['GET api/profiles/x'] = () => json(doc());
    handlers['GET api/profiles/x/abnahme'] = () => json({ nr: 1, doc: doc() });

    // Nur die beiden Wege dieses Tests bewerten. Der Spy liegt auf
    // `window.fetch` und zeichnet jeden Request des Browsers auf — auch den
    // des Stores aus dem beforeEach (ohne Schluessel-Stub) und alles, was ein
    // anderer Spec-Lauf noch nachreicht. Ein `calls.reset()` half nur gegen
    // Requests, die schon abgesetzt waren; ein spaeter eintreffender kippte
    // die Zusicherung, unter Last in der CI (#124).
    const WEGE = ['api/profiles/x', 'api/profiles/x/abnahme'];
    const beobachtet = (): { weg: string; key: string | null }[] =>
      (window.fetch as jasmine.Spy).calls
        .allArgs()
        .map((args) => ({
          weg:
            typeof args[0] === 'string' ? args[0] : ((args[0] as Request).url ?? String(args[0])),
          key: new Headers((args[1] as RequestInit | undefined)?.headers).get('x-ag-key'),
        }))
        .filter((r) => WEGE.includes(r.weg));

    await s.load('x');
    await s.loadAbnahmeDoc('x');

    const eigene = beobachtet();
    // Beide Wege wurden wirklich gegangen — sonst ginge die Zusicherung unten
    // auch bei null Requests durch.
    expect(eigene.map((r) => r.weg)).toEqual(WEGE);
    expect(eigene.filter((r) => r.key !== 'geheim')).toEqual([]);
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
      json([
        { id: 'v2', nr: 2, erstellt: 200 },
        { id: 'v1', nr: 1, kommentar: 'k', automatisch: true, erstellt: 100 },
      ]);
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
      json({
        entry: entry('x', { name: 'Alt', nVersionen: 2, letzteVersionNr: 2, aktualisiert: 950 }),
        doc: doc('Alt'),
      });
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

  it('schickt den AG-Schluessel als Header bei Schreibzugriffen mit', async () => {
    const rolle = TestBed.inject(RolleService);
    handlers['POST api/login'] = () =>
      json({ konfiguriert: true, ok: true }) as unknown as Response;
    await rolle.anmelden('ag-schluessel');
    handlers['PUT api/profiles/x'] = (init) => {
      expect(new Headers(init?.headers).get('x-ag-key')).toBe('ag-schluessel');
      return json({ entry: entry('x') });
    };
    await store.upsert('x', doc());
  });

  it('abnehmen setzt das Kennzeichen und pflegt den Entry ein', async () => {
    handlers['POST api/profiles/x/abnahme'] = (init) => {
      expect(JSON.parse(String(init?.body)).kommentar).toBe('passt');
      return json(
        {
          version: { id: 'v1', nr: 1, abnahme: true, erstellt: 100 },
          entry: entry('x', { abgenommen: true, abnahmeVersionNr: 1, abnahmeZeit: 100 }),
        },
        201,
      );
    };
    await store.abnehmen('x', 'passt');
    expect(store.entries()[0]!.abgenommen).toBeTrue();
    expect(store.entries()[0]!.abnahmeVersionNr).toBe(1);
  });

  it('abnahmeEntfernen nimmt das Kennzeichen zurueck', async () => {
    handlers['GET api/profiles'] = () => json([entry('x', { abgenommen: true })]);
    await store.refresh();
    handlers['DELETE api/profiles/x/abnahme'] = () => json({ entry: entry('x') });
    await store.abnahmeEntfernen('x');
    expect(store.entries()[0]!.abgenommen).toBeUndefined();
  });
});
