import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div id="toast" [class.show]="text()">{{ text() }}</div>`,
})
export class Toast {
  protected readonly text = inject(ToastService).text;
}
