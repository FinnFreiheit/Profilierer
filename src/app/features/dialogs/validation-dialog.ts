import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { ValidationReportService } from '../../core/services/validation-report.service';
import { NavService } from '../../core/services/nav.service';
import { ReportEintrag } from '../../models/validation.model';

/**
 * Validierungsbericht: zeigt die Fehlerliste der Schemavalidierung, wenn ein
 * Export/Upload/Speichern blockiert oder eine Nachricht als nicht valide
 * gemeldet wurde. Wird vom ValidationReportService gesteuert und ist in
 * Editor- und Testdaten-Ansicht eingebunden. Eintraege mit Pfad springen per
 * Klick zum betroffenen Baumknoten.
 */
@Component({
  selector: 'app-validation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './validation-dialog.html',
})
export class ValidationDialog {
  protected readonly report = inject(ValidationReportService);
  private readonly nav = inject(NavService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  /** Anzahl der Fehler, die auf bekannte Schema-Erweiterungen zurueckgehen. */
  protected readonly nErweiterung = computed(
    () => this.report.eintraege().filter((e) => e.erweiterung).length,
  );

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

  /** Sprung zum betroffenen Knoten — der modale Dialog muss vorher zu. */
  protected springe(e: ReportEintrag): void {
    if (!e.pfad) return;
    this.report.schliesse();
    this.nav.jumpTo(e.pfad);
  }
}
