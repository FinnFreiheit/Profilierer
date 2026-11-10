/**
 * Bausteine der Filterspalte, die Profil-Uebersicht, Testdaten-Speicher und
 * Projektansicht teilen: dieselbe Geste soll in allen drei Ansichten dasselbe
 * tun — deshalb stehen Typen und Zaehlregel hier einmal.
 */

/** Ein Wert einer Achse. */
export interface FilterWert {
  id: string;
  label: string;
  /** Treffer, wenn nur dieser Wert (zusaetzlich) gesetzt waere. */
  n: number;
  aktiv: boolean;
}

/** Eine Achse der Filterspalte; `K` sind die Achsen der jeweiligen Ansicht. */
export interface FilterAchse<K extends string = string> {
  key: K;
  label: string;
  /** Werte in Mono setzen (Fachmodul-Kuerzel, Versionsnummern, Nachrichtennamen). */
  mono?: boolean;
  werte: FilterWert[];
  aktiv: boolean;
}

/** Ein gesetzter Filter als Chip ueber der Sammlung. */
export interface AktivChip<K extends string = string> {
  achse: string;
  label: string;
  key: K | 'suche';
  id: string;
}

/**
 * Eine Achse mit Zaehlern bauen. `basis` ist die Grundmenge, gegen die gezaehlt
 * wird — der Aufrufer filtert sie **einmal** je Achse, nicht je Wert erneut.
 */
export function filterAchse<E, K extends string>(a: {
  key: K;
  label: string;
  mono?: boolean;
  basis: readonly E[];
  werte: readonly { id: string; label: string }[];
  gewaehlt: readonly string[];
  trifft: (e: E, id: string) => boolean;
}): FilterAchse<K> {
  return {
    key: a.key,
    label: a.label,
    mono: !!a.mono,
    aktiv: a.gewaehlt.length > 0,
    werte: a.werte.map((w) => ({
      id: w.id,
      label: w.label,
      n: a.basis.filter((e) => a.trifft(e, w.id)).length,
      aktiv: a.gewaehlt.includes(w.id),
    })),
  };
}

/** Einen Wert in einer Auswahl an- bzw. abwaehlen (neue Liste). */
export function umschalten<T>(liste: readonly T[], wert: T): T[] {
  return liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert];
}
