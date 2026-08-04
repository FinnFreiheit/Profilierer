import { ProfileDoc, Status, Wirkung } from '../models/profile.model';
import { DatentypWahl } from './util/datentyp.util';

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
 * Elementname einer Schema-Erweiterung: NCName ohne Doppelpunkt
 * (Erweiterungen liegen im Default-Namespace der Nachricht).
 */
export const ERW_NAME_MUSTER = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/**
 * Vorbelegter Datentyp einer neuen Schema-Erweiterung (#96): `datatypeC` der
 * DIN 91379 — mit 907 Verwendungen der haeufigste Typ in 3.6.2 ueberhaupt.
 * Vorher stand hier `xs:string`, was den Schemagebrauch nicht traf.
 *
 * Die **waehlbaren** Typen stehen nicht mehr hier, sondern werden aus dem
 * geladenen Schema abgeleitet (`core/util/datentyp.util.ts`).
 */
export const ERW_TYP_VORGABE: DatentypWahl = { datentyp: 'datatypeC', datentypQuelle: 'schema' };

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
