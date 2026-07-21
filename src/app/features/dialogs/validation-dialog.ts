import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ValidationReportService } from '../../core/services/validation-report.service';

/**
 * Validierungsbericht: zeigt die Fehlerliste der Schemavalidierung, wenn ein
 * Export/Upload/Speichern blockiert oder eine Nachricht als nicht valide
 * gemeldet wurde. Wird vom ValidationReportService gesteuert und ist in
 * Editor- und Testdaten-Ansicht eingebunden.
 */
@Component({
  selector: 'app-validation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './validation-dialog.html',
})
export class ValidationDialog {
  protected readonly report = inject(ValidationReportService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.report.offen()) {
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }
}
