import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AktivChip } from './filter.model';

/**
 * Die gesetzten Filter als Chips ueber der Sammlung. Ein Klick entfernt die
 * Eingrenzung — derselbe Weg wie der Klick in der Filterspalte.
 */
@Component({
  selector: 'app-aktiv-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'aktivChips' },
  template: `
    @for (c of chips(); track c.key + ':' + c.id) {
      <button class="aktivChip" title="Diese Eingrenzung entfernen" (click)="entferne.emit(c)">
        <span class="aktivChipAchse">{{ c.achse }}</span
        >{{ c.label }}
        <span class="aktivChipX" aria-hidden="true">✕</span>
      </button>
    }
  `,
})
export class AktivChips<K extends string> {
  readonly chips = input.required<AktivChip<K>[]>();
  readonly entferne = output<AktivChip<K>>();
}
