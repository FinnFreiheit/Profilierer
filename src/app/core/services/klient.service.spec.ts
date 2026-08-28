import { TestBed } from '@angular/core/testing';
import { KLIENT_STORAGE, KlientService } from './klient.service';

/**
 * Die anonyme Kennung der Nutzungszaehlung. Geprueft wird, dass sie stabil
 * bleibt (sonst zaehlt jeder Reload einen neuen "Nutzer") und dass ein
 * gesperrter Storage die App nicht ausbremst.
 */
describe('KlientService', () => {
  const neu = (): KlientService => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(KlientService);
  };

  afterEach(() => localStorage.removeItem(KLIENT_STORAGE));

  it('erzeugt eine Kennung und merkt sie sich', () => {
    localStorage.removeItem(KLIENT_STORAGE);
    const id = neu().id;
    expect(id).toMatch(/^[0-9a-f-]{16,64}$/i);
    expect(localStorage.getItem(KLIENT_STORAGE)).toBe(id);
  });

  it('nimmt eine vorhandene Kennung, statt eine neue zu erfinden', () => {
    localStorage.setItem(KLIENT_STORAGE, '6f2b1c4a-1111-4222-8333-444455556666');
    expect(neu().id).toBe('6f2b1c4a-1111-4222-8333-444455556666');
  });

  it('liefert den Kennungs-Header', () => {
    const dienst = neu();
    expect(dienst.header()).toEqual({ 'x-klient': dienst.id });
  });

  // Privates Fenster/gesperrter Storage: die Kennung lebt dann nur im Tab,
  // die Zaehlung darf daran nicht scheitern.
  it('kommt ohne nutzbaren Storage aus', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('gesperrt');
    spyOn(Storage.prototype, 'setItem').and.throwError('gesperrt');
    expect(neu().id).toMatch(/^[0-9a-f-]{16,64}$/i);
  });
});
