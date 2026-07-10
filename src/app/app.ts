import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Topbar } from './features/topbar/topbar';
import { Toolbar } from './features/toolbar/toolbar';
import { Crumbs } from './features/crumbs/crumbs';
import { TreeCanvas } from './features/tree/tree-canvas';
import { DetailPanel } from './features/detail/detail-panel';
import { StatusDialog } from './features/dialogs/status-dialog';
import { MetaDialog } from './features/dialogs/meta-dialog';
import { DiffDialog } from './features/dialogs/diff-dialog';
import { Legend } from './features/legend/legend';
import { PrintDoc } from './features/print/print-doc';
import { Toast } from './shared/toast/toast';
import { FileDropDirective } from './shared/file-drop.directive';
import { PersistenceService } from './core/services/persistence.service';
import { CodelistService } from './core/services/codelist.service';
import { ExportService } from './core/services/export.service';
import { DiffService } from './core/services/diff.service';
import { NavService } from './core/services/nav.service';
import { ToastService } from './core/services/toast.service';
import { StateService } from './core/services/state.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
  imports: [
    Topbar,
    Toolbar,
    Crumbs,
    TreeCanvas,
    DetailPanel,
    StatusDialog,
    MetaDialog,
    DiffDialog,
    Legend,
    PrintDoc,
    Toast,
    FileDropDirective,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly persistence = inject(PersistenceService);
  protected readonly codelists = inject(CodelistService);
  protected readonly exporter = inject(ExportService);
  protected readonly diff = inject(DiffService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);
  private readonly state = inject(StateService);

  protected readonly hasRoot = computed(() => !!this.state.root());

  /** Pfeiltasten-Navigation im Baum (Z.2443-2463). */
  onKeydown(e: KeyboardEvent): void {
    if (!e.key.startsWith('Arrow')) return;
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
    if (document.querySelector('dialog[open]')) return;
    if (this.nav.arrowNavigate(e.key)) e.preventDefault();
  }

  async onXsdFiles(files: FileList | File[]): Promise<void> {
    try {
      const n = await this.persistence.loadXsdFiles(files);
      this.toast.show(`${n} Schemadateien geladen.`);
    } catch (e) {
      this.toast.show(e instanceof Error ? e.message : 'Laden fehlgeschlagen.');
    }
  }

  onCodelistFiles(files: FileList | File[]): void {
    this.codelists.loadCodelistFiles(files);
  }

  onXrep(): void {
    this.codelists.loadFromXRepository();
  }

  /** btnDiff (Z.2378): Dialog oeffnen oder Vergleichsordner waehlen. */
  onDiff(diffDlg: DiffDialog, xsdBInput: HTMLInputElement): void {
    if (this.state.idxB()) diffDlg.open();
    else xsdBInput.click();
  }

  async onXsdB(e: Event, diffDlg: DiffDialog): Promise<void> {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const ok = await this.diff.loadXsdB(input.files);
      if (ok) diffDlg.open();
    }
    input.value = '';
  }

  /** Drag&Drop-Routing (Z.2436-2440). */
  onDropped(files: File[]): void {
    if (files.length === 1 && files[0]!.name.endsWith('.json'))
      this.persistence.loadProfileFile(files[0]!);
    else if (files.some((x) => x.name.toLowerCase().endsWith('.xsd'))) this.onXsdFiles(files);
    else if (files.some((x) => /\.(xml|zip)$/i.test(x.name))) this.onCodelistFiles(files);
  }
}
