import { LibraryEntry } from '../../models/profile.model';
import {
  ZUSTAND_LABEL,
  ZUSTAND_ORDER,
  zustandKlasse,
  zustandLabel,
  zustandVon,
} from './profil-zustand.util';

/**
 * Der Zustand ist abgeleitet, kein Feld. Profil-Uebersicht und Projektseite
 * muessen dieselbe Aussage treffen — deshalb liegt die Regel in einer reinen
 * Funktion und wird hier festgehalten.
 */
describe('profil-zustand.util — Zustand einer Profilierung', () => {
  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({ id: 'p', name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 0, ...over }) as LibraryEntry;

  it('haelt Reihenfolge und Beschriftungen der Achse fest', () => {
    expect([...ZUSTAND_ORDER]).toEqual(['frei', 'geaendert', 'arbeit', 'leer']);
    expect(ZUSTAND_ORDER.map((z) => ZUSTAND_LABEL[z])).toEqual([
      'freigegeben',
      'seit Freigabe geändert',
      'in Arbeit',
      'leer',
    ]);
  });

  it('laesst die Freigabe alles andere schlagen', () => {
    // Auch eine volle Profilierung ist zuerst "freigegeben", nicht "in Arbeit".
    expect(zustandVon(eintrag({ abgenommen: true, nStatus: 5 }))).toBe('frei');
    expect(zustandVon(eintrag({ abgenommen: true, geaendertSeitAbnahme: true }))).toBe('geaendert');
  });

  it('unterscheidet leer von in Arbeit an den Zaehlern', () => {
    expect(zustandVon(eintrag())).toBe('leer');
    expect(zustandVon(eintrag({ nStatus: 1 }))).toBe('arbeit');
    expect(zustandVon(eintrag({ nAusp: 1 }))).toBe('arbeit');
    expect(zustandVon(eintrag({ nEntschieden: 1 }))).toBe('arbeit');
  });

  it('liefert Beschriftung und Klasse der Pille', () => {
    expect(zustandLabel(eintrag({ nStatus: 1 }))).toBe('in Arbeit');
    expect(zustandKlasse(eintrag({ nStatus: 1 }))).toBe('z-arbeit');
    expect(zustandKlasse(eintrag({ abgenommen: true }))).toBe('z-frei');
  });
});
