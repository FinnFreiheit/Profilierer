/**
 * Schlagworte (Tags) an Profilierungen und Testnachrichten: eine freie
 * Ablage-Ordnung neben Fachmodul und Nachrichtentyp — "Pilot", "eNoVA",
 * "Schulung". Sie tragen keine fachliche Aussage; entsprechend laesst der
 * Fach-Hash des Servers sie aussen vor (eine freigegebene Profilierung bleibt
 * freigegeben, wenn jemand sie einsortiert).
 *
 * Die Normalisierung spiegelt `server/tags.js`. Beide Seiten muessen dieselbe
 * Menge ergeben, sonst springt die Anzeige beim Speichern: der Client zeigt,
 * was er geschickt hat, der Server antwortet mit dem, was er gespeichert hat.
 */

/** Laengengrenze je Schlagwort; darueber wird abgeschnitten. */
export const TAG_MAX_LAENGE = 40;
/** Obergrenze je Eintrag — mehr traegt keine Kachel, und Filter werden Brei. */
export const TAG_MAX_ANZAHL = 20;

/**
 * Beliebige Eingabe (Liste oder kommagetrennter Text) zu einer normalisierten
 * Schlagwortliste: getrimmt, ohne Leere, ohne Doppelte (Gross-/Kleinschreibung
 * egal, die erste Schreibweise gewinnt), alphabetisch.
 */
export function normalisiereTags(input: readonly string[] | string | undefined | null): string[] {
  const roh = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const gesehen = new Set<string>();
  const out: string[] = [];
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

/** Schlagworte als Eingabetext (kommagetrennt) fuer die Dialoge. */
export function tagsAlsText(tags: readonly string[] | undefined): string {
  return (tags ?? []).join(', ');
}

/** Ein Schlagwort mit der Anzahl der Eintraege, die es tragen. */
export interface TagOption {
  tag: string;
  n: number;
}

/**
 * Die vorhandenen Schlagworte einer Liste mit ihrer Haeufigkeit — Grundlage
 * der Filterleiste und der Vorschlaege im Eingabefeld. Sortiert nach Haeufigkeit
 * (das Gebraeuchliche zuerst), bei Gleichstand alphabetisch.
 */
export function tagOptionen<T>(
  items: readonly T[],
  tagsVon: (item: T) => readonly string[] | undefined,
): TagOption[] {
  const map = new Map<string, TagOption>();
  for (const item of items) {
    for (const tag of tagsVon(item) ?? []) {
      const schluessel = tag.toLocaleLowerCase('de');
      const treffer = map.get(schluessel);
      if (treffer) treffer.n++;
      else map.set(schluessel, { tag, n: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'de'));
}

/**
 * Traegt der Eintrag **alle** gewaehlten Schlagworte? Mehrere Filter wirken
 * zusammen (UND) — sie grenzen ein, statt die Treffermenge aufzublaehen.
 * Gross-/Kleinschreibung bleibt aussen vor.
 */
export function hatAlleTags(
  tags: readonly string[] | undefined,
  gewaehlt: readonly string[],
): boolean {
  if (!gewaehlt.length) return true;
  const vorhanden = new Set((tags ?? []).map((t) => t.toLocaleLowerCase('de')));
  return gewaehlt.every((t) => vorhanden.has(t.toLocaleLowerCase('de')));
}

/** Ein Schlagwort in der Auswahl an-/abwaehlen (fuer die Filterleiste). */
export function schalteTag(gewaehlt: readonly string[], tag: string): string[] {
  const schluessel = tag.toLocaleLowerCase('de');
  const drin = gewaehlt.some((t) => t.toLocaleLowerCase('de') === schluessel);
  return drin
    ? gewaehlt.filter((t) => t.toLocaleLowerCase('de') !== schluessel)
    : [...gewaehlt, tag];
}
