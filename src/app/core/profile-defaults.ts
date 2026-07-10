import { ProfileDoc, Status, Wirkung } from '../models/profile.model';

/** Vordefinierte Statusfarben (Profilierer.html Z.315-318). */
export const FARBEN: Record<string, string> = {
  'Grün': '#1D9E75',
  'Bernstein': '#BA7517',
  'Grau': '#888780',
  'Rosa': '#D4537E',
  'Blau': '#378ADD',
  'Violett': '#7F77DD',
  'Petrol': '#0F6E56',
  'Rot': '#E24B4A',
};

/** Waehlbare Wirkungen mit Anzeigetext (Z.325). */
export const WIRKUNGEN: ReadonlyArray<readonly [Wirkung, string]> = [
  ['pflicht', 'Pflicht'],
  ['optional', 'optional'],
  ['ausgeschlossen', 'ausgeschlossen'],
  ['markierung', 'nur Markierung'],
];

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
  return { meta: {}, statuses: defaultStatuses(), elemente: {}, auspraegungen: {} };
}
