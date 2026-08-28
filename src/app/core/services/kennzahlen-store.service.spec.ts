import { TestBed } from '@angular/core/testing';
import { KennzahlenStoreService } from './kennzahlen-store.service';

/**
 * Abruf der Kennzahlen. Der wichtigste Fall ist das 403: es bedeutet "fehlende
 * AG-Rolle", nicht "Backend kaputt" — und es darf nicht als Ausnahme aus dem
 * Store fallen, sonst steht in der Ansicht ein Ausfall statt eines Hinweises.
 */
describe('KennzahlenStoreService', () => {
  let antwort: () => Response;
  let urls: string[];

  const store = (): KennzahlenStoreService => TestBed.inject(KennzahlenStoreService);

  const daten = () => ({
    erzeugt: 1,
    zeitraum: { von: '2026-08-01', bis: '2026-08-30', tage: 30 },
    nutzung: {
      heute: { zugriffe: 1, klienten: 1, fehler: 0, dauerMs: 5 },
      fenster: { zugriffe: 2, klienten: 1, fehler: 0, dauerMs: 5 },
      ohneKennung: 0,
      wiederkehrend: 0,
      verlauf: [],
      stundenprofil: [],
      routen: [],
    },
    bestand: {},
  });

  beforeEach(() => {
    urls = [];
    antwort = () => new Response(JSON.stringify(daten()), { status: 200 });
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL) => {
      urls.push(String(input));
      return Promise.resolve(antwort());
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('laedt nicht von selbst — der Endpunkt ist AG-exklusiv', () => {
    store();
    expect(urls.length).toBe(0);
  });

  it('fuellt die Daten und reicht den Zeitraum durch', async () => {
    const s = store();
    await s.refresh(7);
    expect(urls).toContain('api/kennzahlen?tage=7');
    expect(s.daten()?.zeitraum.tage).toBe(30);
    expect(s.fehler()).toBeNull();
    expect(s.laedt()).toBeFalse();
  });

  it('meldet 403 als fehlende Rolle, nicht als Ausfall', async () => {
    antwort = () => new Response('{}', { status: 403 });
    const s = store();
    await s.refresh();
    expect(s.daten()).toBeNull();
    expect(s.fehler()).toContain('AG-Schlüssel');
    expect(s.laedt()).toBeFalse();
  });

  it('meldet andere Fehler als Ausfall des Backends', async () => {
    antwort = () => new Response('{}', { status: 500 });
    const s = store();
    await s.refresh();
    expect(s.fehler()).toContain('nicht erreichbar');
  });
});
