import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { KennzahlenRoute } from '../../models/kennzahlen.model';

/** Eine Zeile des Balkendiagramms, fertig gerechnet fuers Template. */
interface Zeile {
  route: string;
  zugriffe: number;
  fehler: number;
  dauerMs: number;
  y: number;
  breite: number;
  fehlerBreite: number;
  titel: string;
}

/** Hoehe einer Zeile samt Abstand. */
const ZEILE = 26;
/** Breite der Beschriftungsspalte (Routennamen sind lang). */
const LABEL = 250;
/** Platz rechts fuer die Zahl hinter dem laengsten Balken. */
const ZAHL = 52;
const BREITE = 720;

/**
 * Die zugriffsstaerksten Routen als liegende Balken — liegend, weil die
 * normalisierten Routennamen ("PATCH /api/testmessages/:id") als senkrechte
 * Achsenbeschriftung unlesbar waeren. Der Fehleranteil sitzt als zweiter
 * Balken im ersten.
 */
@Component({
  selector: 'app-balken-diagramm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './balken-diagramm.html',
})
export class BalkenDiagramm {
  readonly routen = input.required<KennzahlenRoute[]>();

  protected readonly breite = BREITE;
  protected readonly label = LABEL;
  protected readonly hoehe = computed(() => Math.max(ZEILE, this.routen().length * ZEILE) + 6);

  protected readonly zeilen = computed<Zeile[]>(() => {
    const routen = this.routen();
    // Klemmt die Bezugsgroesse: ohne sie teilt eine leere Liste durch null.
    const max = Math.max(1, ...routen.map((r) => r.zugriffe));
    const platz = BREITE - LABEL - ZAHL;
    return routen.map((r, i) => ({
      ...r,
      y: i * ZEILE + 4,
      breite: Math.max(1, (r.zugriffe / max) * platz),
      fehlerBreite: Math.min(1, r.fehler / Math.max(1, r.zugriffe)) * ((r.zugriffe / max) * platz),
      titel: `${r.route}: ${r.zugriffe} Zugriffe, ${r.fehler} Fehler, ⌀ ${r.dauerMs} ms`,
    }));
  });

  protected readonly leer = computed(() => this.routen().length === 0);

  protected readonly vorlesetext = computed(() =>
    this.routen()
      .map((r) => `${r.route}: ${r.zugriffe}`)
      .join('; '),
  );
}
