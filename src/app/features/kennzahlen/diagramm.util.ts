/**
 * Geometrie der Kennzahlen-Diagramme. Reine Funktionen, damit die Rechnung
 * ohne DOM pruefbar bleibt — anders als im TreeCanvas kommen die Werte hier
 * vollstaendig aus den Daten, es wird nichts am DOM gemessen.
 */

/** Innenabstaende der Zeichenflaeche (Platz fuer Achsenbeschriftung). */
export const RAND = { links: 42, rechts: 12, oben: 12, unten: 22 };

/** Koordinatensystem der Verlaufsdiagramme (skaliert per viewBox). */
export const VB = { breite: 720, hoehe: 200 };

/**
 * Naechste "runde" Obergrenze ueber `max` (1, 2 oder 5 mal Zehnerpotenz).
 * Nie 0 — sonst teilt die Skalierung durch null und die Achse traegt keine Zahl.
 */
export function netteObergrenze(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const potenz = 10 ** Math.floor(Math.log10(max));
  for (const f of [1, 2, 5, 10]) if (max <= f * potenz) return f * potenz;
  return 10 * potenz;
}

/** X-Position des i-ten von n Punkten; ein einzelner Punkt steht links. */
export function xPos(i: number, n: number): number {
  if (n <= 1) return RAND.links;
  const breite = VB.breite - RAND.links - RAND.rechts;
  return RAND.links + (i * breite) / (n - 1);
}

/** Y-Position eines Werts unter gegebener Obergrenze. */
export function yPos(wert: number, obergrenze: number): number {
  const hoehe = VB.hoehe - RAND.oben - RAND.unten;
  const anteil = Math.max(0, Math.min(1, wert / Math.max(1, obergrenze)));
  return VB.hoehe - RAND.unten - anteil * hoehe;
}

/** 'YYYY-MM-DD' als 'TT.MM.' — die Achse braucht kein Jahr. */
export function tagKurz(tag: string): string {
  const [, m, t] = tag.split('-');
  return `${t}.${m}.`;
}
