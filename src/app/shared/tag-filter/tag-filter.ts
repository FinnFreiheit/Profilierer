import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { TagOption, schalteTag } from '../../core/util/tags.util';

/**
 * Schlagwort-Filter als Chip-Leiste — gemeinsam von Profil-Uebersicht und
 * Testdaten-Speicher genutzt, damit dieselbe Geste in beiden Ansichten dasselbe
 * tut. Mehrere gewaehlte Schlagworte wirken **zusammen** (UND): jeder Klick
 * grenzt weiter ein.
 *
 * Die Leiste zeigt nur Schlagworte, die tatsaechlich vergeben sind; ohne
 * Schlagworte bleibt sie ganz weg (der Aufrufer prueft `optionen().length`).
 */
@Component({
  selector: 'app-tag-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tag-filter.html',
})
export class TagFilter {
  /** Vorhandene Schlagworte mit Haeufigkeit (aus `tagOptionen`). */
  readonly optionen = input.required<TagOption[]>();
  /** Gewaehlte Schlagworte — zweiweg gebunden an die Ansicht. */
  readonly gewaehlt = model.required<string[]>();

  protected readonly hatAuswahl = computed(() => this.gewaehlt().length > 0);

  protected istGewaehlt(tag: string): boolean {
    const schluessel = tag.toLocaleLowerCase('de');
    return this.gewaehlt().some((t) => t.toLocaleLowerCase('de') === schluessel);
  }

  protected schalte(tag: string): void {
    this.gewaehlt.set(schalteTag(this.gewaehlt(), tag));
  }

  protected zuruecksetzen(): void {
    this.gewaehlt.set([]);
  }
}
