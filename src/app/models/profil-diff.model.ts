/**
 * Modell des Profil-Vergleichs ("was hat sich seit der Abnahme geaendert?").
 *
 * Bewusst getrennt von `diff.model.ts`: dort werden zwei XJustiz-SCHEMATA
 * verglichen (Felder `typ`/`prof`), hier zwei Profil-DOKUMENTE. Gemeinsam ist
 * nur die Optik, nicht die Semantik.
 */

export type ProfilDiffArt = 'neu' | 'entfernt' | 'geändert';

/** Fachlicher Bereich — Gliederung und Filter-Chips im Dialog. */
export type ProfilDiffBereich = 'meta' | 'status' | 'element' | 'auspraegung' | 'erweiterung';

/** Ein einzelnes geaendertes Feld innerhalb eines Eintrags. */
export interface ProfilFeldDiff {
  /** Technischer Feldname (status, min, max, anmerkung, werte, name, …). */
  feld: string;
  /** Anzeigename ("Status", "Mindest-Vorkommen", "Zulässige Werte"). */
  label: string;
  /** Aufgeloester Anzeigewert; undefined = nicht gesetzt (Anzeige "—"). */
  vorher?: string;
  nachher?: string;
  /** Kompakte Zusatzangabe, derzeit nur bei `werte`: "+ kl01, kl02 · − kl09". */
  delta?: string;
}

/** Ein Unterschied an genau einer Stelle des Profils. */
export interface ProfilDiffEintrag {
  art: ProfilDiffArt;
  bereich: ProfilDiffBereich;
  /** Roher Map-Key aus dem ProfileDoc; leer bei meta/status. */
  pfad: string;
  /** Ueberschrift: pretty(Elementname) bzw. Auspraegungs-/Status-/Feldname. */
  titel: string;
  /** Pfad mit aufgeloesten IDs: `nachricht.x/…/beteiligung „Kläger"`. */
  pfadKlartext: string;
  felder: ProfilFeldDiff[];
  /** Im Arbeitsstand vorhanden → Sprung in den Baum moeglich. */
  springbar: boolean;
}

export interface ProfilDiffResult {
  eintraege: ProfilDiffEintrag[];
  zaehler: Record<ProfilDiffArt, number>;
  proBereich: Record<ProfilDiffBereich, number>;
}
