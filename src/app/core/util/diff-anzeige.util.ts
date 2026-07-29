/**
 * Gemeinsame Anzeige-Konstanten aller Vergleichsansichten (Schema-Diff,
 * Profil-Diff, XML-Diff). Damit lesen sich die drei Listen gleich, obwohl sie
 * fachlich Verschiedenes vergleichen.
 */

export const DIFF_FARBEN: Record<string, string> = {
  neu: '#1e7d3e',
  entfernt: '#b23a3a',
  geändert: '#8a6d0b',
};

export const DIFF_SYM: Record<string, string> = { neu: '+', entfernt: '−', geändert: '~' };
