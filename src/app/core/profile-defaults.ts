import { ProfileDoc, Status, Wirkung } from '../models/profile.model';

/** Vordefinierte Statusfarben (Profilierer.html Z.315-318). */
export const FARBEN: Record<string, string> = {
  Grün: '#1D9E75',
  Bernstein: '#BA7517',
  Grau: '#888780',
  Rosa: '#D4537E',
  Blau: '#378ADD',
  Violett: '#7F77DD',
  Petrol: '#0F6E56',
  Rot: '#E24B4A',
};

/** Waehlbare Wirkungen mit Anzeigetext (Z.325). */
export const WIRKUNGEN: ReadonlyArray<readonly [Wirkung, string]> = [
  ['pflicht', 'Pflicht'],
  ['optional', 'optional'],
  ['ausgeschlossen', 'ausgeschlossen'],
  ['markierung', 'nur Markierung'],
];

/**
 * Klartext zu jeder Wirkung — ein Satz ohne Fachjargon, der im Detailbereich,
 * in der Hilfe und in Kurzhinweisen erklaert, was eine Antwort fuer die
 * Nachricht bedeutet. Die Statusnamen der Profilierung sind frei waehlbar;
 * verstaendlich wird eine Antwort erst ueber ihre Wirkung.
 */
export const WIRKUNG_ERKLAERUNG: Record<Wirkung, string> = {
  pflicht: 'Die Angabe muss in jeder Nachricht enthalten sein.',
  optional: 'Ausfüllen, sofern die Information vorliegt — sonst weglassen.',
  ausgeschlossen: 'Wird in diesem Szenario nicht verwendet.',
  markierung: 'Fachlich offen — kommt auf die Klärungsliste.',
};

/** Klartext fuer „keine eigene Antwort" — der Standard entscheidet. */
export const STANDARD_ERKLAERUNG = 'Keine eigene Vorgabe — es gilt die Regel des Standards.';

/**
 * Tastenkuerzel je Wirkung beim Bearbeiten einer Profilierung. Die Taste
 * haengt an der Wirkung, nicht am Status: gibt es mehrere Stufen derselben
 * Wirkung, greift sie am ersten Status je Wirkung.
 */
export const WIRKUNG_TASTE: Record<Wirkung, string> = {
  pflicht: 'Z',
  optional: 'O',
  ausgeschlossen: 'N',
  markierung: 'K',
};

/** Taste fuer „wie der Standard" — setzt die eigene Antwort zurueck. */
export const STANDARD_TASTE = 'S';

/**
 * Umkehrung von `WIRKUNG_TASTE`: welche Wirkung meint der Tastendruck?
 * Gross-/Kleinschreibung spielt keine Rolle (Shift zaehlt mit). `null` fuer
 * jede andere Taste — auch fuer `STANDARD_TASTE`, die keine Wirkung setzt,
 * sondern die eigene Antwort zuruecknimmt.
 */
export function wirkungFuerTaste(taste: string): Wirkung | null {
  const t = taste.toUpperCase();
  const treffer = (Object.entries(WIRKUNG_TASTE) as [Wirkung, string][]).find(
    ([, k]) => k === t,
  )?.[0];
  return treffer ?? null;
}

/**
 * Elementname einer Schema-Erweiterung: NCName ohne Doppelpunkt
 * (Erweiterungen liegen im Default-Namespace der Nachricht).
 */
export const ERW_NAME_MUSTER = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Standard-Statusstufen eines neuen Profils (Z.319-324). */
export function defaultStatuses(): Status[] {
  return [
    { id: 's1', name: 'zwingend', farbe: '#1D9E75', wirkung: 'pflicht' },
    { id: 's2', name: 'anzugeben, wenn vorhanden', farbe: '#BA7517', wirkung: 'optional' },
    { id: 's3', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
    { id: 's4', name: 'zu klären', farbe: '#D4537E', wirkung: 'markierung' },
  ];
}

/** Ein frisches, leeres Profil (newProfile, Z.333). */
export function newProfile(): ProfileDoc {
  return {
    meta: {},
    statuses: defaultStatuses(),
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
  };
}
