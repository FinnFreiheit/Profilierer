import { TestBed } from '@angular/core/testing';
import { TeilenService } from './teilen.service';
import { ToastService } from './toast.service';

/**
 * `navigator.clipboard` haengt am Prototyp und ist je nach Kontext (kein
 * Secure Context) gar nicht da — fuer den Test wird es als eigene, wieder
 * loeschbare Eigenschaft gesetzt, damit beide Kopierwege sicher greifen.
 */
function setzeZwischenablage(wert: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value: wert, configurable: true });
}

describe('TeilenService', () => {
  let teilen: TeilenService;
  let toast: ToastService;
  /** Adresszeile des Karma-Fensters — startZiel veraendert sie wirklich. */
  let urlVorher: string;

  beforeEach(() => {
    spyOn(console, 'warn');
    TestBed.configureTestingModule({});
    teilen = TestBed.inject(TeilenService);
    toast = TestBed.inject(ToastService);
    urlVorher = window.location.href;
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
    window.history.replaceState(null, '', urlVorher);
  });

  it('baut den Link gegen den <base href> und kodiert die id', () => {
    expect(teilen.linkFuerProfil('p 7f3a/91')).toBe(
      new URL('?profil=p%207f3a%2F91', document.baseURI).href,
    );
  });

  it('kopiert den Link und quittiert', async () => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    setzeZwischenablage({ writeText });
    await teilen.kopiereProfilLink('p1');
    expect(writeText).toHaveBeenCalledWith(teilen.linkFuerProfil('p1'));
    expect(toast.text()).toContain('Link zum Teilen kopiert');
  });

  it('weicht auf execCommand aus, wenn es keine Zwischenablage gibt', async () => {
    setzeZwischenablage(undefined);
    const exec = spyOn(document, 'execCommand').and.returnValue(true);
    await teilen.kopiereProfilLink('p1');
    expect(exec).toHaveBeenCalledWith('copy');
    expect(toast.text()).toContain('Link zum Teilen kopiert');
  });

  it('weicht auf execCommand aus, wenn die Zwischenablage abweist', async () => {
    setzeZwischenablage({ writeText: jasmine.createSpy().and.rejectWith(new Error('verboten')) });
    const exec = spyOn(document, 'execCommand').and.returnValue(true);
    await teilen.kopiereProfilLink('p1');
    expect(exec).toHaveBeenCalledWith('copy');
    expect(toast.text()).toContain('Link zum Teilen kopiert');
  });

  it('zeigt den Link zum Kopieren von Hand, wenn beide Wege scheitern', async () => {
    setzeZwischenablage(undefined);
    spyOn(document, 'execCommand').and.returnValue(false);
    const prompt = spyOn(window, 'prompt').and.returnValue(null);
    await teilen.kopiereProfilLink('p1');
    expect(prompt).toHaveBeenCalled();
    expect(prompt.calls.mostRecent().args[1]).toBe(teilen.linkFuerProfil('p1'));
    expect(toast.text()).toBe('');
  });

  it('liest die id aus dem Link und raeumt den Parameter aus der Adresszeile', () => {
    window.history.replaceState(null, '', '?profil=p%207f3a&x=1#tief');
    expect(teilen.startZiel()).toEqual({ art: 'profil', id: 'p 7f3a' });
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#tief');
  });

  it('gibt ohne Parameter null zurueck und laesst die Adresszeile in Ruhe', () => {
    const replace = spyOn(window.history, 'replaceState');
    expect(teilen.startZiel()).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  // ── Testnachricht ──────────────────────────────────────────────────

  it('baut den Nachrichten-Link gegen den <base href> und kodiert die id', () => {
    expect(teilen.linkFuerTestnachricht('t 1/2')).toBe(
      new URL('?testnachricht=t%201%2F2', document.baseURI).href,
    );
  });

  it('kopiert den Nachrichten-Link und quittiert eigens', async () => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    setzeZwischenablage({ writeText });
    await teilen.kopiereTestnachrichtLink('t1');
    expect(writeText).toHaveBeenCalledWith(teilen.linkFuerTestnachricht('t1'));
    expect(toast.text()).toContain('Testnachricht');
  });

  it('erkennt den Nachrichten-Link und raeumt den Parameter', () => {
    window.history.replaceState(null, '', '?testnachricht=t1&x=1');
    expect(teilen.startZiel()).toEqual({ art: 'testnachricht', id: 't1' });
    expect(window.location.search).toBe('?x=1');
  });

  it('nimmt bei beiden Parametern das Profil und raeumt dennoch beide', () => {
    window.history.replaceState(null, '', '?profil=p1&testnachricht=t1');
    expect(teilen.startZiel()).toEqual({ art: 'profil', id: 'p1' });
    expect(window.location.search).toBe('');
  });
});
