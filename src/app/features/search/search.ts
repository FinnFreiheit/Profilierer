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
  protected readonly hasRoot = this.state.hasRoot;

  protected readonly hits = computed(() => {
    const q = this.query();
    return q.trim() ? this.search.run(q) : [];
  });

  protected readonly open = computed(() => this.focused() && this.query().trim().length > 0);

  /** Horizontaler Versatz des Panels, damit es nicht rechts aus dem Viewport ragt. */
  protected readonly panelLeft = signal(0);

  protected onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.query.set(input.value);
    this.updatePanelPos(input);
  }

  protected onFocus(e: FocusEvent): void {
    this.focused.set(true);
    this.updatePanelPos(e.target as HTMLInputElement);
  }

  private updatePanelPos(input: HTMLInputElement): void {
    const rect = input.getBoundingClientRect();
    // Muss zur Panel-Breite in styles.scss passen (#searchPanel: width 460px, max-width 92vw)
    const panelWidth = Math.min(460, window.innerWidth * 0.92);
    const overhang = rect.left + panelWidth - (window.innerWidth - 8);
    this.panelLeft.set(Math.max(8 - rect.left, Math.min(0, -overhang)));
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
