import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { SearchService } from '../../core/services/search.service';
import { NavService } from '../../core/services/nav.service';

/**
 * Baum-Suche (Profilierer.html Z.223, #searchPanel Z.244, runSearch Z.712).
 * Eingabefeld mit Treffer-Popover; Enter springt zum ersten Treffer.
 */
@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search.html',
})
export class Search {
  private readonly state = inject(StateService);
  private readonly search = inject(SearchService);
  private readonly nav = inject(NavService);

  protected readonly query = signal('');
  protected readonly focused = signal(false);
  protected readonly hasRoot = computed(() => !!this.state.root());

  protected readonly hits = computed(() => {
    const q = this.query();
    return q.trim() ? this.search.run(q) : [];
  });

  protected readonly open = computed(() => this.focused() && this.query().trim().length > 0);

  protected onInput(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      const first = this.hits()[0];
      if (first) this.pick(first.path);
    } else if (e.key === 'Escape') {
      this.close();
      (e.target as HTMLInputElement).blur();
    }
  }

  protected pick(path: string): void {
    this.close();
    this.nav.jumpTo(path);
  }

  protected close(): void {
    this.focused.set(false);
  }
}
