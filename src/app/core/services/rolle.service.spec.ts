import { TestBed } from '@angular/core/testing';
import { RolleService, AG_KEY_STORAGE } from './rolle.service';

describe('RolleService', () => {
  let handlers: Record<string, (init?: RequestInit) => Response>;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    localStorage.removeItem(AG_KEY_STORAGE);
    handlers = {};
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : ((input as Request).url ?? String(input));
      const method = (init?.method || 'GET').toUpperCase();
      const h = handlers[`${method} ${url}`];
      return Promise.resolve(
        h ? h(init) : new Response('not mocked: ' + method + ' ' + url, { status: 500 }),
      );
    });
    TestBed.configureTestingModule({});
  });

  afterEach(() => localStorage.removeItem(AG_KEY_STORAGE));

  it('anmelden mit korrektem Schluessel aktiviert die AG-Rolle und persistiert den Schluessel', async () => {
    handlers['POST api/login'] = (init) => {
      expect(JSON.parse(String(init?.body)).key).toBe('richtig');
      return json({ konfiguriert: true, ok: true });
    };
    const rolle = TestBed.inject(RolleService);
    expect(rolle.agAktiv()).toBeFalse();
    expect(await rolle.anmelden('richtig')).toBe('ok');
    expect(rolle.agAktiv()).toBeTrue();
    expect(localStorage.getItem(AG_KEY_STORAGE)).toBe('richtig');
  });

  it('anmelden unterscheidet falschen Schluessel von fehlender Konfiguration', async () => {
    const rolle = TestBed.inject(RolleService);
    handlers['POST api/login'] = () => json({ konfiguriert: true, ok: false });
    expect(await rolle.anmelden('tippfehler')).toBe('falsch');
    expect(rolle.agAktiv()).toBeFalse();
    handlers['POST api/login'] = () => json({ konfiguriert: false, ok: false });
    expect(await rolle.anmelden('egal')).toBe('nicht-konfiguriert');
    expect(rolle.agAktiv()).toBeFalse();
    expect(localStorage.getItem(AG_KEY_STORAGE)).toBeNull();
  });

  it('die Anmeldung uebersteht einen Reload (Schluessel aus dem Browser-Storage)', () => {
    localStorage.setItem(AG_KEY_STORAGE, 'gemerkt');
    const rolle = TestBed.inject(RolleService);
    expect(rolle.agAktiv()).toBeTrue();
    expect(rolle.authHeaders()).toEqual({ 'x-ag-key': 'gemerkt' });
  });

  it('abmelden verwirft den Schluessel dauerhaft', async () => {
    handlers['POST api/login'] = () => json({ konfiguriert: true, ok: true });
    const rolle = TestBed.inject(RolleService);
    await rolle.anmelden('richtig');
    rolle.abmelden();
    expect(rolle.agAktiv()).toBeFalse();
    expect(rolle.authHeaders()).toEqual({});
    expect(localStorage.getItem(AG_KEY_STORAGE)).toBeNull();
  });
});
