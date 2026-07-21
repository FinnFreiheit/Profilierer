import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { GuidedService } from '../../core/services/guided.service';

/** Statuslegende (renderLegend, Profilierer.html Z.1458-1466). */
@Component({
  selector: 'app-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legend.html',
})
export class Legend {
  private readonly state = inject(StateService);
  private readonly guidedSvc = inject(GuidedService);
  protected readonly statuses = this.state.statuses;
  /** Tastatur-Hinweis nur im gefuehrten Profil-Modus (nicht Instanz-Modus). */
  protected readonly guided = computed(
    () => this.state.guided() && !this.state.readOnly() && !this.guidedSvc.instanzModus(),
  );
}
