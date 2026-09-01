import { RAND, VB, netteObergrenze, tagKurz, xPos, yPos } from './diagramm.util';

/**
 * Die Geometrie der Diagramme. Wichtig sind die Randfaelle: eine leere oder
 * einelementige Reihe darf keine Division durch null und kein NaN im
 * SVG-Pfad erzeugen — ein NaN macht die ganze Grafik unsichtbar.
 */
describe('Diagramm-Geometrie', () => {
  it('rundet die Obergrenze auf 1/2/5 mal Zehnerpotenz', () => {
    expect(netteObergrenze(7)).toBe(10);
    expect(netteObergrenze(412)).toBe(500);
    expect(netteObergrenze(1)).toBe(1);
    expect(netteObergrenze(120)).toBe(200);
  });

  it('gibt nie 0 zurueck — sonst teilt die Skalierung durch null', () => {
    expect(netteObergrenze(0)).toBe(1);
    expect(netteObergrenze(-5)).toBe(1);
    expect(netteObergrenze(Number.NaN)).toBe(1);
  });

  it('verteilt die Punkte ueber die Breite, ein einzelner steht links', () => {
    expect(xPos(0, 5)).toBe(RAND.links);
    expect(xPos(4, 5)).toBe(VB.breite - RAND.rechts);
    expect(xPos(0, 1)).toBe(RAND.links);
    expect(Number.isFinite(xPos(0, 0))).toBeTrue();
  });

  it('legt 0 auf den Boden und die Obergrenze an die Decke', () => {
    expect(yPos(0, 10)).toBe(VB.hoehe - RAND.unten);
    expect(yPos(10, 10)).toBe(RAND.oben);
    // Ausreisser ueber der Grenze werden geklemmt, statt aus dem Bild zu laufen.
    expect(yPos(99, 10)).toBe(RAND.oben);
    expect(Number.isFinite(yPos(1, 0))).toBeTrue();
  });

  it('kuerzt den Tag auf TT.MM.', () => {
    expect(tagKurz('2026-08-05')).toBe('05.08.');
  });
});
