/**
 * Fachmodul einer XJustiz-Nachricht (Issue #88/#89).
 *
 * Der Nachrichtenname traegt es im zweiten Segment:
 * `nachricht.`**`enova`**`.entscheidung.2900003`. Bewusst aus dem Namen
 * abgeleitet und nicht aus der Schemadatei: die Uebersichtsseite zeigt
 * gespeicherte Profilierungen, ohne dass ein Schema geladen sein muss.
 *
 * Angezeigt wird das **Kuerzel**, nicht ausgeschrieben. Der Standard 3.6.2
 * fuehrt 29 Module (`gds`, `straf`, `mahn`, `inso`, `enova`, `dabag`, …); eine
 * Klartext-Zuordnung waere Pflegeaufwand und bei etlichen Kuerzeln Ratewerk.
 */

/** Sammelgruppe fuer alles, was dem Namensmuster nicht folgt. */
export const OHNE_FACHMODUL = '';

/**
 * Kuerzel des Fachmoduls, oder `OHNE_FACHMODUL`, wenn der Name dem Muster
 * `nachricht.<modul>.<...>` nicht folgt (leerer Name, Freitext, Altbestand).
 */
export function fachmodulOf(nachricht: string | null | undefined): string {
  if (!nachricht) return OHNE_FACHMODUL;
  const teile = nachricht.split('.');
  if (teile.length < 3 || teile[0] !== 'nachricht') return OHNE_FACHMODUL;
  const modul = teile[1]!.trim();
  return modul || OHNE_FACHMODUL;
}

/**
 * Gruppiert nach Fachmodul: Module alphabetisch, die Sammelgruppe ohne Modul
 * immer zuletzt. Die Reihenfolge **innerhalb** einer Gruppe bleibt die der
 * Eingabe — die Aufrufer sortieren bereits selbst (Uebersicht: zuletzt
 * geaendert zuerst).
 */
export function nachFachmodul<T>(
  items: readonly T[],
  nachrichtOf: (item: T) => string | null | undefined,
): { modul: string; items: T[] }[] {
  const gruppen = new Map<string, T[]>();
  for (const it of items) {
    const modul = fachmodulOf(nachrichtOf(it));
    const liste = gruppen.get(modul);
    if (liste) liste.push(it);
    else gruppen.set(modul, [it]);
  }
  return [...gruppen.entries()]
    .map(([modul, items]) => ({ modul, items }))
    .sort((a, b) => {
      if (a.modul === OHNE_FACHMODUL) return 1;
      if (b.modul === OHNE_FACHMODUL) return -1;
      return a.modul.localeCompare(b.modul, 'de');
    });
}
