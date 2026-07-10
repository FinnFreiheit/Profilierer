import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StateService } from '../../core/services/state.service';

/** Statuslegende (renderLegend, Profilierer.html Z.1458-1466). */
@Component({
  selector: 'app-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legend.html',
})
export class Legend {
  protected readonly statuses = inject(StateService).statuses;
}
