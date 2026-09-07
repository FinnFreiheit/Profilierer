import { LibraryEntry } from '../../models/profile.model';

/**
 * Zustand einer Profilierung, wie ihn die Kachel als Pille traegt, die
 * Filterspalte als Achse anbietet und die Projektseite je Szenario zeigt
 * (v4-Entwurf, design/profil-uebersicht-v4). Er ist aus dem Eintrag
 * **abgeleitet**, kein gespeichertes Feld — deshalb steht die Ableitung hier
 * einmal und nicht in jeder Ansicht, die sie braucht.
 */
export type Zustand = 'frei' | 'geaendert' | 'arbeit' | 'leer';

export const ZUSTAND_LABEL: Record<Zustand, string> = {
  frei: 'freigegeben',
  geaendert: 'seit Freigabe geändert',
  arbeit: 'in Arbeit',
  leer: 'leer',
};

/** Reihenfolge in Filterspalte und Gliederung: das Fertige zuerst. */
export const ZUSTAND_ORDER: readonly Zustand[] = ['frei', 'geaendert', 'arbeit', 'leer'];

/**
 * Die Freigabe schlaegt alles: eine abgenommene Profilierung ist freigegeben
 * bzw. seit der Freigabe geaendert, egal wie viel in ihr steht. Erst danach
 * entscheidet, ob ueberhaupt etwas festgelegt wurde.
 */
export function zustandVon(e: LibraryEntry): Zustand {
  if (e.abgenommen) return e.geaendertSeitAbnahme ? 'geaendert' : 'frei';
  if (!e.nStatus && !e.nAusp && !e.nEntschieden) return 'leer';
  return 'arbeit';
}

/** Beschriftung der Zustandspille. */
export function zustandLabel(e: LibraryEntry): string {
  return ZUSTAND_LABEL[zustandVon(e)];
}

/** CSS-Klasse der Zustandspille (`z-frei`, `z-geaendert`, …). */
export function zustandKlasse(e: LibraryEntry): string {
  return 'z-' + zustandVon(e);
}
