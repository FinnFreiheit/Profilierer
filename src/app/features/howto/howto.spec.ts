import { TestBed } from '@angular/core/testing';
import { Howto } from './howto';
import { StateService } from '../../core/services/state.service';

/**
 * Die Anleitung ist statischer Inhalt — geprueft wird, dass jeder Schritt ein
 * Bild benennt (kein toter Verweis auf `public/howto/`) und die Sprungmarken
 * eindeutig sind, damit die Inhaltsuebersicht nicht ins Leere springt.
 */
describe('Howto — Anleitung', () => {
  let howto: {
    teile: {
      id: string;
      schritte: { nr: number; titel: string; bild: string; bildText: string; text: string[] }[];
    }[];
    kapitel: () => { schritte: { anker: string }[] }[];
    bildPfad: (name: string) => string;
    goHowtoView?: unknown;
  };
  let state: StateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Howto] }).compileComponents();
    const fixture = TestBed.createComponent(Howto);
    howto = fixture.componentInstance as unknown as typeof howto;
    state = TestBed.inject(StateService);
  });

  it('fuehrt beide Ablaeufe mit je bebilderten Schritten', () => {
    expect(howto.teile.map((t) => t.id)).toEqual(['profil', 'testnachricht']);
    for (const t of howto.teile) {
      expect(t.schritte.length).toBeGreaterThan(0);
      for (const s of t.schritte) {
        expect(s.titel).toBeTruthy();
        expect(s.text.length).toBeGreaterThan(0);
        expect(s.bild).toMatch(/^\d\d-[a-z-]+$/);
        expect(s.bildText).toBeTruthy();
      }
    }
  });

  it('vergibt eindeutige Sprungmarken', () => {
    const anker = howto.kapitel().flatMap((k) => k.schritte.map((s) => s.anker));
    expect(new Set(anker).size).toBe(anker.length);
  });

  it('verweist auf die WebP-Dateien unter howto/', () => {
    expect(howto.bildPfad('01-profil-uebersicht')).toBe('howto/01-profil-uebersicht.webp');
  });

  it('startet nicht selbst — die Ansicht schaltet die Uebersicht um', () => {
    expect(state.view()).toBe('dashboard');
  });
});
