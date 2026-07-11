import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { DiffService } from '../../core/services/diff.service';
import { NavService } from '../../core/services/nav.service';
import { ToastService } from '../../core/services/toast.service';
import { BundledSchemaService } from '../../core/services/bundled-schema.service';
import { DiffEntry, DiffResult } from '../../models/diff.model';
import { BundledVersion } from '../../models/schema-bundle.model';
import { pretty } from '../../core/util/pretty.util';

export const DIFF_FARBEN: Record<string, string> = { neu: '#1e7d3e', entfernt: '#b23a3a', 'geändert': '#8a6d0b' };
export const DIFF_SYM: Record<string, string> = { neu: '+', entfernt: '−', 'geändert': '~' };

/**
 * Versionsvergleich-Dialog (openDiffDlg/renderDiffList, Profilierer.html
 * Z.274-284, 2243-2312).
 */
@Component({
  selector: 'app-diff-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diff-dialog.html',
})
export class DiffDialog {
  private readonly state = inject(StateService);
  private readonly diff = inject(DiffService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);
  private readonly bundled = inject(BundledSchemaService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  readonly loadOther = output<void>();

  protected readonly hasIdxB = computed(() => !!this.state.idxB());
  /** Hinterlegte Versionen als Vergleich — ohne die aktuell aktive Primaerversion. */
  protected readonly bundledOptions = computed(() =>
    this.state.bundledVersions().filter((v) => v.dir !== this.state.activeBundle()),
  );

  protected readonly farben = DIFF_FARBEN;
  protected readonly sym = DIFF_SYM;
  protected readonly result = signal<DiffResult | null>(null);
  protected readonly onlyProf = signal(false);

  protected readonly versionA = computed(() => this.state.version());
  protected readonly versionB = computed(() => this.state.idxB()?.version || '?');
  protected readonly msgName = computed(() => this.state.msgName());

  protected readonly nProf = computed(() => this.result()?.rows.filter((r) => r.prof).length ?? 0);

  protected readonly rows = computed(() => {
    const r = this.result();
    if (!r) return [];
    const filtered = this.onlyProf() ? r.rows.filter((x) => x.prof) : r.rows;
    return filtered.slice(0, 800).map((x) => ({
      ...x,
      name: (x.rel.split('/').filter(Boolean).pop() || '').split('#')[0]!,
    }));
  });

  protected readonly moreCount = computed(() => {
    const r = this.result();
    if (!r) return 0;
    const total = (this.onlyProf() ? r.rows.filter((x) => x.prof) : r.rows).length;
    return Math.max(0, total - 800);
  });

  open(): void {
    this.result.set(this.diff.computeDiff());
    const d = this.dlg().nativeElement;
    if (!d.open) d.showModal();
  }

  protected close(): void {
    this.dlg().nativeElement.close();
  }

  /** Hinterlegte Version als Vergleichsschema laden und Diff aktualisieren. */
  protected async pickBundled(v: BundledVersion): Promise<void> {
    try {
      const files = await this.bundled.files(v);
      const ok = await this.diff.loadXsdB(files);
      if (ok) this.open();
    } catch (e) {
      this.toast.show(
        `XJustiz ${v.label} konnte nicht geladen werden: ` + (e instanceof Error ? e.message : e),
      );
    }
  }

  protected pretty(name: string): string {
    return pretty(name);
  }

  protected onRow(r: DiffEntry): void {
    if (r.art === 'neu') return;
    this.close();
    this.nav.jumpTo((this.msgName() || '') + r.rel);
  }

  protected copy(r: DiffEntry, e: Event): void {
    e.stopPropagation();
    const name = (r.rel.split('/').filter(Boolean).pop() || '').split('#')[0];
    const text = `${name}${r.typ ? ' (' + r.typ + ')' : ''} — ${this.msgName()}${r.rel}${r.info ? ' — ' + r.info : ''}`;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => this.toast.show('Kopiert: ' + name))
      .catch(() => prompt('Zum Kopieren (Strg+C):', text));
  }
}
