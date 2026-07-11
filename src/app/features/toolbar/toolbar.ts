import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { ToastService } from '../../core/services/toast.service';
import { MessagePicker } from '../message-picker/message-picker';
import { Search } from '../search/search';

/**
 * Werkzeugleiste (Profilierer.html Z.211-241). Ansichts-Umschalter binden
 * direkt an die Store-Signals; Dialog-/Export-Aktionen werden als Events
 * gemeldet (Verdrahtung in P4/P7).
 */
@Component({
  selector: 'app-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePicker, Search],
  templateUrl: './toolbar.html',
})
export class Toolbar {
  protected readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);

  readonly metaClick = output<void>();
  readonly statusClick = output<void>();
  readonly saveClick = output<void>();
  readonly excelClick = output<void>();
  readonly schClick = output<void>();
  readonly xmlClick = output<void>();
  readonly printClick = output<void>();

  protected readonly hasRoot = computed(() => !!this.state.root());
  protected readonly hasIdxB = computed(() => !!this.state.idxB());

  protected readonly fortschrittText = computed(() => {
    const { nStatus, nAusp } = this.state.fortschritt();
    return nStatus ? `${nStatus} Festlegungen${nAusp ? ' · ' + nAusp + ' Ausprägungen' : ''}` : '';
  });

  protected onName(e: Event): void {
    this.state.patchMeta({ name: (e.target as HTMLInputElement).value.trim() });
  }

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected expand(): void {
    this.nav.expandAllTree();
  }

  protected collapse(): void {
    this.nav.collapseTree();
  }

  protected prefillMandatory(): void {
    const n = this.nav.prefillMandatoryStatus();
    this.toast.show(
      n ? n + ' Pflichtelemente vorbelegt' : 'Keine weiteren Pflichtelemente offen',
    );
  }
}
