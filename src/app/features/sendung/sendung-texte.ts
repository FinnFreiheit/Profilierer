import { AnlagenQuelle } from '../../../../server/sendung/pruefung.js';

/** Anzeigetexte der Testsendung — geteilt von Sendungs-Ansicht und Anlagen-Karte. */

export const BESTANDTEIL_TEXT: Record<string, string> = {
  '001': 'Original',
  '002': 'Repräsentat',
  '003': 'Signatur',
  '004': 'signierte Vorversion',
  '006': 'Transfervermerk',
  '010': 'Prüfvermerk',
  '011': 'VHN',
  '012': 'hinlaufendes eEB',
  '013': 'ursprüngliches Format',
};

export const QUELLE_TEXT: Record<AnlagenQuelle, string> = {
  upload: 'hochgeladen',
  platzhalter: 'Platzhalter',
  signatur: 'Testsignatur',
  testnachricht: 'Testnachricht',
};

export const QUELLE_TITEL: Record<AnlagenQuelle, string> = {
  upload: 'Hochgeladene Datei — geht unverändert ins Paket',
  platzhalter: 'Wird beim Export als Platzhalter-PDF mit den Angaben aus der XML erzeugt',
  signatur:
    'Wird beim Export als abgesetzte Testsignatur über die beigelegte Bezugsdatei erzeugt (nicht qualifiziert)',
  testnachricht: 'Eingebundene Testnachricht',
};

/** Bestandteil-Code als kurzer Text. */
export function bestandteilText(code: string | undefined): string {
  if (!code) return 'ohne Bestandteil';
  return BESTANDTEIL_TEXT[code] ?? `Bestandteil ${code}`;
}
