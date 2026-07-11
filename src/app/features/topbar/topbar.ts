import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { StateService } from '../../core/services/state.service';

/**
 * Kopfleiste (Profilierer.html Z.196-209): Schema-/Codelisten-/Profil-Laden
 * und die Versions-Pille. Aktionen werden als Events gemeldet; die
 * Koordination erledigt die App-Shell.
 */
@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './topbar.html',
})
export class Topbar {
  private readonly state = inject(StateService);

  readonly xsdFiles = output<FileList>();
  readonly codelistFiles = output<FileList>();
  readonly profileFile = output<File>();
  readonly instanceFile = output<File>();
  readonly xrepClick = output<void>();
  readonly diffClick = output<void>();
  /** Wechsel auf eine hinterlegte Schemaversion (dir aus dem Manifest). */
  readonly bundledPick = output<string>();

  protected readonly hasIdx = computed(() => !!this.state.idx());
  protected readonly bundledVersions = computed(() => this.state.bundledVersions());
  protected readonly activeBundle = computed(() => this.state.activeBundle());
  protected readonly diffLabel = computed(() => {
    const b = this.state.idxB();
    return b ? `Diff ${this.state.version() || '?'} ↔ ${b.version || '?'}` : 'Version vergleichen…';
  });

  /** updateVerInfo (Z.980-984) als reaktive Pille. */
  protected readonly verInfo = computed(() => {
    const idx = this.state.idx();
    if (!idx) return 'keine Schemata geladen';
    const ncl = Object.keys(this.state.codelists()).length;
    return (
      `XJustiz ${this.state.version() || '?'} · ${this.state.docs().length} Schemata · ` +
      `${idx.messages.length} Nachrichten${ncl ? ' · ' + ncl + ' Codelisten' : ''}`
    );
  });

  protected pick(input: HTMLInputElement): void {
    input.click();
  }

  protected onBundled(e: Event): void {
    const dir = (e.target as HTMLSelectElement).value;
    if (dir) this.bundledPick.emit(dir);
  }

  protected onXsd(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) this.xsdFiles.emit(input.files);
    input.value = '';
  }

  protected onCodelist(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) this.codelistFiles.emit(input.files);
    input.value = '';
  }

  protected onProfile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.profileFile.emit(f);
    input.value = '';
  }

  protected onInstance(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.instanceFile.emit(f);
    input.value = '';
  }
}
