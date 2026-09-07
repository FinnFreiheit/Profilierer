import { menuLinkeKante } from './menu';

/**
 * Die Lage des Panels ist reine Rechnung — im Test ohne Layout pruefbar
 * (gemessene Rechtecke waeren in der Testumgebung ohnehin 0). Der Fall, um den
 * es geht: rechtsbuendig muss gegen die **tatsaechliche** Panelbreite gerechnet
 * werden, nicht gegen die konfigurierte Obergrenze — sonst haengt ein schmales
 * Menue sichtbar links neben seinem Knopf.
 */
describe('menuLinkeKante', () => {
  const knopf = { left: 700, right: 800 };

  it('legt rechtsbuendig die rechte Kante des Panels auf die des Knopfes', () => {
    expect(menuLinkeKante(knopf, 320, 'rechts', 1200)).toBe(480);
    // Schmaler Inhalt: die Kante wandert mit, das Panel bleibt am Knopf.
    expect(menuLinkeKante(knopf, 160, 'rechts', 1200)).toBe(640);
  });

  it('legt linksbuendig die linke Kante auf die des Knopfes', () => {
    expect(menuLinkeKante(knopf, 320, 'links', 1200)).toBe(700);
  });

  it('klemmt links wie rechts am Fensterrand', () => {
    // Rechtsbuendig an einem Knopf ganz links: nicht ins Negative.
    expect(menuLinkeKante({ left: 10, right: 60 }, 320, 'rechts', 1200)).toBe(8);
    // Linksbuendig an einem Knopf ganz rechts: das Panel bleibt im Fenster.
    expect(menuLinkeKante({ left: 1150, right: 1190 }, 320, 'links', 1200)).toBe(872);
  });
});
