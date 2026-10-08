import {
  STANDARD_ERKLAERUNG,
  STANDARD_TASTE,
  WIRKUNGEN,
  WIRKUNG_ERKLAERUNG,
  WIRKUNG_TASTE,
} from './profile-defaults';

/**
 * Klartext und Tastenkuerzel haengen an der Wirkung. Kommt eine Wirkung dazu,
 * muessen Erklaerung und Taste mitwachsen — und die Tasten muessen eindeutig
 * bleiben, sonst greift im Bearbeiten-Modus die falsche Antwort.
 */
describe('profile-defaults — Wirkung in Klartext und Taste', () => {
  it('kennt zu jeder Wirkung eine Erklaerung und eine Taste', () => {
    for (const [wirkung] of WIRKUNGEN) {
      expect(WIRKUNG_ERKLAERUNG[wirkung]).toBeTruthy();
      expect(WIRKUNG_TASTE[wirkung]).toMatch(/^[A-Z]$/);
    }
  });

  it('vergibt jede Taste nur einmal — Standard eingeschlossen', () => {
    const tasten = [...WIRKUNGEN.map(([w]) => WIRKUNG_TASTE[w]), STANDARD_TASTE];
    expect(new Set(tasten).size).toBe(tasten.length);
  });

  it('erklaert auch die fehlende eigene Antwort', () => {
    expect(STANDARD_ERKLAERUNG).toBeTruthy();
  });
});
