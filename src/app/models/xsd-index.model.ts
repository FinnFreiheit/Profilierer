/** Ein geparstes XSD-Dokument (Z.351). */
export interface XsdDoc {
  file: string;
  dom: Document;
}

/** Referenz auf eine waehlbare Nachricht (aus buildIndexFrom, Z.367). */
export interface MessageRef {
  name: string;
  doc: string;
  file: string;
  /** Fachmodul zur Gruppierung in der Nachrichtenliste. */
  modul?: string;
}

/**
 * Der Schema-Index: Maps von complexType-, simpleType- und element-Namen auf
 * die jeweiligen XSD-Elemente, plus die Liste waehlbarer Nachrichten.
 * `version`/`kennung` werden beim Aufbau mitgefuehrt (Z.354-357, 1110).
 */
export interface XsdIndex {
  ct: Record<string, Element>;
  st: Record<string, Element>;
  el: Record<string, Element>;
  messages: MessageRef[];
  version?: string;
  kennung?: string;
}

/** Ergebnis von particlesOfCT (Z.385-386): Partikel eines complexType. */
export interface ParticleModel {
  model: 'sequence' | 'choice' | 'all';
  parts: Element[];
  simple: boolean;
}
