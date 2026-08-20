/**
 * Schlagworte (Tags) an Profilierungen und Testnachrichten — eine freie
 * Ablage-Ordnung neben Fachmodul und Nachrichtentyp.
 *
 * Der Server normalisiert beim Einliefern, damit Kachel und Filter mit einer
 * Schreibweise arbeiten: getrimmt, leere raus, Doppelte (ohne Ruecksicht auf
 * Gross-/Kleinschreibung) zusammengefasst, alphabetisch. Die Regel spiegelt
 * `src/app/core/util/tags.util.ts` im Frontend — beide Seiten muessen dieselbe
 * Menge ergeben, sonst springt die Anzeige beim Speichern.
 */

/** Laengengrenze je Schlagwort; darueber wird abgeschnitten. */
export const TAG_MAX_LAENGE = 40;
/** Obergrenze je Eintrag — mehr traegt keine Kachel, und Filter werden Brei. */
export const TAG_MAX_ANZAHL = 20;

/**
 * Beliebige Eingabe (Array oder kommagetrennter Text) zu einer normalisierten
 * Schlagwortliste. Gibt immer ein Array zurueck, ggf. leer.
 */
export function normalisiereTags(input) {
  const roh = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const gesehen = new Set();
  const out = [];
  for (const t of roh) {
    if (typeof t !== 'string') continue;
    const wert = t.trim().replace(/\s+/g, ' ').slice(0, TAG_MAX_LAENGE);
    if (!wert) continue;
    const schluessel = wert.toLocaleLowerCase('de');
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    out.push(wert);
    if (out.length >= TAG_MAX_ANZAHL) break;
  }
  return out.sort((a, b) => a.localeCompare(b, 'de'));
}
