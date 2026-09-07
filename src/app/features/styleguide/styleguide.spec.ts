import { TestBed } from '@angular/core/testing';
import { Styleguide } from './styleguide';

/**
 * Der Styleguide ist die Quelle des Design-System-Spiegels (ADR 0022): das
 * Bundle-Skript verlaesst sich darauf, dass jede Karte Gruppe und Name traegt
 * und die Farbkarte die wirklich geltenden Token-Werte zeigt.
 */
describe('Styleguide — Karten', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Styleguide] }).compileComponents();
  });

  const render = (): HTMLElement => {
    const fixture = TestBed.createComponent(Styleguide);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('rendert vierzehn Karten, jede mit eindeutiger Kennung, Gruppe und Name', () => {
    const karten = Array.from(render().querySelectorAll('[data-ds-card]'));
    expect(karten.length).toBe(14);
    for (const k of karten) {
      expect(k.getAttribute('data-ds-group')).toBeTruthy();
      expect(k.getAttribute('data-ds-name')).toBeTruthy();
    }
    const kennungen = karten.map((k) => k.getAttribute('data-ds-card'));
    expect(new Set(kennungen).size).toBe(14);
  });

  it('zeigt jeden Farb-Token mit dem Wert aus dem Stylesheet', () => {
    const swatches = Array.from(render().querySelectorAll('.sgSwatch'));
    expect(swatches.length).toBe(40);
    const blau = swatches.find((s) => s.querySelector('code')?.textContent === '--preussischblau');
    expect(blau?.querySelector('.sgWert')?.textContent?.trim()).toBe('#14213d');
  });
});
