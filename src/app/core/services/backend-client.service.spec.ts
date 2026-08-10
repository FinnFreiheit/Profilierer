import { TestBed } from '@angular/core/testing';
import { BackendClient, BackendFehler, BackendZugriff } from './backend-client.service';
import { RolleService } from './rolle.service';

/**
 * Der eine Weg ans Backend. Geprueft wird das, was vorher je Store und je
 * Aufrufart einzeln dastand — allen voran der AG-Schluessel: die
 * 404-toleranten Lesepfade schickten ihn frueher **nicht** mit.
 */
describe('BackendClient', () => {
  let http: BackendZugriff;
  let gesendet: { url: string; init?: RequestInit }[];
  let antwort: () => Response;

  /**
   * Nach Pfad statt nach Position: die Stores frischen ihren Index im
   * Konstruktor auf, ein solcher Aufruf aus einer anderen Suite kann noch in
   * der Warteschlange stehen und die Zaehlung verschieben.
   */
  const kopf = (pfad: string, name: string): string | undefined => {
    const treffer = gesendet.find((g) => g.url === 'api' + pfad);
    return treffer ? (new Headers(treffer.init?.headers).get(name) ?? undefined) : undefined;
  };

  beforeEach(() => {
    gesendet = [];
    antwort = () => new Response('{}', { status: 200 });
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL, init?: RequestInit) => {
      gesendet.push({ url: String(input), init });
      return Promise.resolve(antwort());
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: RolleService, useValue: { authHeaders: () => ({ 'x-ag-key': 'geheim' }) } },
      ],
    });
    http = TestBed.inject(BackendClient).fuer('Testquelle');
  });

  it('loest den Pfad relativ gegen die API-Basis auf', async () => {
    await http.json('/profiles');
    expect(gesendet.map((g) => g.url)).toContain('api/profiles');
  });

  // Der eigentliche Befund: der Schluessel muss an *jeden* Request, sonst
  // greift der Abnahme-Schutz (ADR 0012) an den Lesepfaden nicht.
  it('schickt den AG-Schluessel an schreibende und lesende Requests', async () => {
    antwort = () => new Response('{}', { status: 200 });
    await http.json('/profiles', { method: 'POST', body: '{}' });
    await http.jsonOderNull('/profiles/x');
    await http.textOderNull('/testmessages/x/xml');

    expect(kopf('/profiles', 'x-ag-key')).toBe('geheim');
    expect(kopf('/profiles/x', 'x-ag-key')).toBe('geheim');
    expect(kopf('/testmessages/x/xml', 'x-ag-key')).toBe('geheim');
  });

  it('setzt content-type nur, wenn ein Body mitgeht', async () => {
    await http.json('/profiles', { method: 'POST', body: '{}' });
    await http.json('/profiles/x', { method: 'DELETE' });

    expect(kopf('/profiles', 'content-type')).toBe('application/json');
    expect(kopf('/profiles/x', 'content-type')).toBeUndefined();
  });

  it('204 liefert undefined statt eines Parse-Fehlers', async () => {
    antwort = () => new Response(null, { status: 204 });
    await expectAsync(http.json('/profiles/x', { method: 'DELETE' })).toBeResolvedTo(
      undefined as never,
    );
  });

  it('404 ist bei den OderNull-Wegen eine Aussage, kein Fehler', async () => {
    antwort = () => new Response('', { status: 404 });
    expect(await http.jsonOderNull('/profiles/weg')).toBeNull();
    expect(await http.textOderNull('/testmessages/weg/xml')).toBeNull();
  });

  it('404 bleibt auf dem json-Weg ein Fehler', async () => {
    antwort = () => new Response('', { status: 404 });
    await expectAsync(http.json('/profiles/weg')).toBeRejectedWithError(/Testquelle: GET/);
  });

  // 403 ist der Abnahme-Schutz, kein Ausfall: der Status muss den Aufrufer
  // erreichen, damit die Meldung stimmt (core/util/hinweis.util.ts).
  it('traegt den HTTP-Status am Fehler', async () => {
    antwort = () => new Response('', { status: 403 });
    try {
      await http.json('/profiles/x/hinweise', { method: 'POST', body: '{}' });
      fail('sollte werfen');
    } catch (e) {
      expect(e instanceof BackendFehler).toBeTrue();
      expect((e as BackendFehler).status).toBe(403);
      expect((e as BackendFehler).message).toContain('Testquelle: POST');
    }
  });

  it('nennt die Quelle im Fehlertext', async () => {
    antwort = () => new Response('', { status: 500 });
    await expectAsync(http.textOderNull('/x')).toBeRejectedWithError(/Testquelle: GET \/x → 500/);
  });
});
