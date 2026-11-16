import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FilterAchse } from './filter.model';

/**
 * **Die Filterspalte der Uebersichten** (Einschub `filter` des Rahmens
 * `app-bibliothek`): Kopf mit „alle", die Zeile „Alle …" und je Achse die
 * Werte mit Zaehler. Reine Anzeige — Zustand und Zaehlregel bleiben in der
 * jeweiligen Ansicht, hier steht nur das Markup, das vorher dreimal kopiert war.
 *
 * Der Host nimmt nicht am Layout teil (`display: contents`): die Elemente
 * liegen wie zuvor direkt in der Spalte.
 */
@Component({
  selector: 'app-filter-spalte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-spalte.html',
  host: { style: 'display: contents' },
})
export class FilterSpalte<K extends string> {
  readonly achsen = input.required<FilterAchse<K>[]>();
  /** Ist irgendeine Eingrenzung gesetzt (Achse oder Suche)? */
  readonly hatFilter = input.required<boolean>();
  /** Beschriftung der Zeile, die alles zeigt („Alle Profilierungen"). */
  readonly alleLabel = input.required<string>();
  /** Groesse der ungefilterten Sammlung. */
  readonly gesamt = input.required<number>();
  /** Wovon der Zaehler im Tooltip spricht. */
  readonly einheit = input('Einträge');

  /** Einen Wert einer Achse an- bzw. abwaehlen. */
  readonly schalte = output<{ key: K; id: string }>();
  /** Eine Achse leeren (× am Achsenkopf). */
  readonly leere = output<K>();
  /** Alle Eingrenzungen entfernen. */
  readonly zuruecksetzen = output<void>();
}
