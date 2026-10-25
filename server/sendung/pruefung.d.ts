/** Typen zu `pruefung.js` (Paketpruefung der Testsendung, ADR 0024). */

export declare const BESTANDTEIL: { original: '001'; repraesentat: '002'; signatur: '003' };
export declare const HAUPTNAME: 'xjustiz_nachricht.xml';

export interface PlatzDokument {
  id?: string;
  nummer?: string;
  anzeigename?: string;
  dokumententyp?: string;
}

export interface Platz {
  dateiname: string;
  /** Name der eingebundenen Testnachricht, aus der der Platz stammt (fehlt = Hauptnachricht). */
  herkunft?: string;
  bestandteil?: string;
  bezugsdateien: string[];
  dokument?: PlatzDokument;
}

export type AnlagenQuelle = 'upload' | 'platzhalter' | 'signatur' | 'testnachricht';

export interface SendungsDatei {
  dateiname: string;
  quelle: AnlagenQuelle;
  /** Die ersten Bytes (Magic-Bytes-Pruefung); fehlt = nicht beurteilt. */
  kopf?: Uint8Array;
}

export interface Befund {
  regel: string;
  schwere: 'fehler' | 'hinweis';
  dateiname: string;
  text: string;
}

export declare function plaetzeLesen(doc: Document): Platz[];
export interface GeplanteDatei {
  dateiname: string;
  quelle: AnlagenQuelle;
  platz: Platz;
}

export declare function dateienPlanen(
  plaetze: Platz[],
  uploadNamen: Set<string>,
  einbNamen?: Set<string>,
): GeplanteDatei[];
export declare function pruefen(p: { plaetze: Platz[]; dateien: SendungsDatei[] }): Befund[];
export declare function zaehle(befunde: Befund[]): { fehler: number; hinweise: number };
