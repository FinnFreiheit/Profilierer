import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { ExportService, PrintRow } from '../../core/services/export.service';

interface PrintHeader {
  title: string;
  msgName: string;
  version: string;
  datum: string;
  autor: string;
  beschreibung: string;
}

/**
 * Druckansicht (doPrint, Profilierer.html Z.2334-2365). Wird per print()
 * befuellt und ruft danach window.print(). Sichtbar nur via @media print.
 */
@Component({
  selector: 'app-print-doc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './print-doc.html',
})
export class PrintDoc {
  private readonly state = inject(StateService);
  private readonly exporter = inject(ExportService);

  protected readonly header = signal<PrintHeader | null>(null);
  protected readonly rows = signal<PrintRow[]>([]);

  print(): void {
    const m = this.state.meta();
    this.header.set({
      title: m.name || '(ohne Namen)',
      msgName: this.state.msgName() || '',
      version: this.state.version(),
      datum: m.datum || new Date().toLocaleDateString('de-DE'),
      autor: m.autor || '',
      beschreibung: m.beschreibung || '',
    });
    this.rows.set(this.exporter.buildPrintRows());
    setTimeout(() => window.print(), 60);
  }
}
