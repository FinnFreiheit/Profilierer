import { TestBed } from '@angular/core/testing';
import { HinweisStoreService } from './hinweis-store.service';
import { Hinweis } from '../../models/profile.model';

/** Ein Hinweis-Stub. */
function hw(id: string, over: Partial<Hinweis> = {}): Hinweis {
  return { id, pfad: 'm/az', text: 'Text ' + id, zeit: 1000, ...over };
}

describe('HinweisStoreService (HTTP)', () => {
  let store: HinweisStoreService;
  let handlers: Record<string, (init?: RequestInit) => Response>;
  let gesendet: Record<string, unknown>;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    handlers = {};
    gesendet = {};
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : ((input as Request).url ?? String(input));
      const method = (init?.method || 'GET').toUpperCase();
      const key = `${method} ${url}`;
      if (init?.body) gesendet[key] = JSON.parse(String(init.body));
      const h = handlers[key];
      return Promise.resolve(h ? h(init) : new Response('not mocked: ' + key, { status: 500 }));
    });
    TestBed.configureTestingModule({});
    store = TestBed.inject(HinweisStoreService);
  });

  it('laden fuellt das Signal und merkt sich das Profil', async () => {
    handlers['GET api/profiles/p1/hinweise'] = () => json([hw('a'), hw('b')]);
    await store.lade('p1');
    expect(store.hinweise().map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('laden ohne Profil leert das Signal, ohne zu laden', async () => {
    handlers['GET api/profiles/p1/hinweise'] = () => json([hw('a')]);
    await store.lade('p1');
    await store.lade(null);
    expect(store.hinweise()).toEqual([]);
  });

  it('anlegen haengt den Server-Hinweis an; mehrere am selben Element bleiben nebeneinander', async () => {
    handlers['GET api/profiles/p1/hinweise'] = () => json([hw('a')]);
    await store.lade('p1');
    handlers['POST api/profiles/p1/hinweise'] = () =>
      json({ hinweis: hw('b', { text: 'zweiter' }) }, 201);
    await store.anlegen('m/az', 'zweiter');
    expect(store.hinweise().map((h) => h.id)).toEqual(['a', 'b']);
    expect(gesendet['POST api/profiles/p1/hinweise']).toEqual({ pfad: 'm/az', text: 'zweiter' });
  });

  it('anlegen ohne geladenes Profil tut nichts', async () => {
    await store.anlegen('m/az', 'text');
    expect(store.hinweise()).toEqual([]);
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it('aendern ersetzt genau einen Eintrag', async () => {
    handlers['GET api/profiles/p1/hinweise'] = () => json([hw('a'), hw('b')]);
    await store.lade('p1');
    handlers['PATCH api/profiles/p1/hinweise/a'] = () =>
      json({ hinweis: hw('a', { text: 'neu', erledigt: true }) });
    await store.aendern('a', { text: 'neu', erledigt: true });
    expect(store.hinweise().map((h) => [h.id, h.text, !!h.erledigt])).toEqual([
      ['a', 'neu', true],
      ['b', 'Text b', false],
    ]);
    expect(gesendet['PATCH api/profiles/p1/hinweise/a']).toEqual({ text: 'neu', erledigt: true });
  });

  it('loeschen entfernt den Eintrag aus dem Signal', async () => {
    handlers['GET api/profiles/p1/hinweise'] = () => json([hw('a'), hw('b')]);
    await store.lade('p1');
    handlers['DELETE api/profiles/p1/hinweise/a'] = () => new Response(null, { status: 204 });
    await store.loeschen('a');
    expect(store.hinweise().map((h) => h.id)).toEqual(['b']);
  });

  it('ersetzeAlle schickt die ganze Liste und uebernimmt die Antwort', async () => {
    const importiert = [hw('x', { autor: 'Anna', rolle: 'extern', zeit: 42 })];
    handlers['PUT api/profiles/p2/hinweise'] = () => json(importiert);
    await store.ersetzeAlle('p2', [{ pfad: 'm/az', text: 'aus Datei', zeit: 42, autor: 'Anna' }]);
    expect(gesendet['PUT api/profiles/p2/hinweise']).toEqual([
      { pfad: 'm/az', text: 'aus Datei', zeit: 42, autor: 'Anna' },
    ]);
    // Fremdes Profil: der Zustand des offenen Profils bleibt unberuehrt.
    expect(store.hinweise()).toEqual([]);
  });

  it('ersetzeAlle des offenen Profils aktualisiert das Signal', async () => {
    handlers['GET api/profiles/p1/hinweise'] = () => json([hw('alt')]);
    await store.lade('p1');
    handlers['PUT api/profiles/p1/hinweise'] = () => json([hw('neu')]);
    await store.ersetzeAlle('p1', [{ pfad: 'm/az', text: 'neu', zeit: 1 }]);
    expect(store.hinweise().map((h) => h.id)).toEqual(['neu']);
  });

  describe('abgeleitete Sichten', () => {
    beforeEach(async () => {
      handlers['GET api/profiles/p1/hinweise'] = () =>
        json([
          hw('1', { pfad: 'm/c', text: 'offen2', zeit: 300 }),
          hw('2', { pfad: 'm/b', text: 'fertig', erledigt: true, zeit: 100 }),
          hw('3', { pfad: 'm/a', text: 'offen1', zeit: 200 }),
          hw('4', { pfad: 'm/a', text: 'offen1b', zeit: 250 }),
        ]);
      await store.lade('p1');
    });

    it('eintraege sortiert offene vor erledigten, dann nach Pfad und Zeit', () => {
      expect(store.eintraege().map((h) => h.text)).toEqual([
        'offen1',
        'offen1b',
        'offen2',
        'fertig',
      ]);
    });

    it('nOffen zaehlt nur offene Eintraege', () => {
      expect(store.nOffen()).toBe(3);
    });

    it('offeneJePfad buendelt die offenen Hinweise je Element', () => {
      expect(
        store
          .offeneJePfad()
          .get('m/a')
          ?.map((h) => h.text),
      ).toEqual(['offen1', 'offen1b']);
      expect(store.offeneJePfad().get('m/b')).toBeUndefined();
    });

    it('jePfad enthaelt auch erledigte (Detail-Panel zeigt beide)', () => {
      expect(
        store
          .jePfad()
          .get('m/b')
          ?.map((h) => h.text),
      ).toEqual(['fertig']);
    });

    it('loescheUnter raeumt Traeger und Teilbaum, laesst Nachbarn stehen', async () => {
      handlers['GET api/profiles/p3/hinweise'] = () =>
        json([
          hw('1', { pfad: 'm/bet@a1' }),
          hw('2', { pfad: 'm/bet@a1/rolle' }),
          hw('3', { pfad: 'm/bet@a1/anschrift@b2/ort' }),
          hw('4', { pfad: 'm/bet@a2' }),
          hw('5', { pfad: 'm/betArt' }),
          hw('6', { pfad: 'm/bet' }),
        ]);
      await store.lade('p3');
      handlers['DELETE api/profiles/p3/hinweise?praefix=m%2Fbet%40a1'] = () =>
        json({ entfernt: 3 });
      await store.loescheUnter('m/bet@a1');
      expect(store.hinweise().map((h) => h.id)).toEqual(['4', '5', '6']);
    });

    it('loescheUnter spart den Request, wenn der Teilbaum keinen Hinweis traegt', async () => {
      handlers['GET api/profiles/p4/hinweise'] = () => json([hw('1', { pfad: 'm/bet@a2' })]);
      await store.lade('p4');
      // Kein handler fuer das DELETE: ein Request wuerde 500 liefern und werfen.
      await store.loescheUnter('m/bet@a1');
      expect(store.hinweise().map((h) => h.id)).toEqual(['1']);
    });

    it('loescheUnter ist ohne offenes Profil ein No-Op (Nachrichten-Modus)', async () => {
      await store.lade(null);
      await store.loescheUnter('m/bet@a1');
      expect(store.hinweise()).toEqual([]);
    });

    it('anc zaehlt offene Hinweise auf allen Vorfahren (Grenzen / und @)', async () => {
      handlers['GET api/profiles/p2/hinweise'] = () =>
        json([
          hw('1', { pfad: 'm/bet@a1/rolle' }),
          hw('2', { pfad: 'm/bet@a1/name', erledigt: true }),
        ]);
      await store.lade('p2');
      const anc = store.anc();
      expect(anc.get('m')).toBe(1);
      expect(anc.get('m/bet')).toBe(1);
      expect(anc.get('m/bet@a1')).toBe(1);
      expect(anc.get('m/bet@a1/rolle')).toBeUndefined();
    });
  });
});
