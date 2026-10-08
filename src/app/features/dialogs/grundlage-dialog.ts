import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { BundledVersion } from '../../models/schema-bundle.model';

/**
 * "Grundlage" (Editor v4): worauf die Ansicht beruht — XJustiz-Version,
 * Schemaquellen, Codelisten, Versionsvergleich, Fehlerprotokoll.
 *
 * Der Inhalt war bis dahin das Datenbasis-Menue der Werkzeugleiste (#80).
 * Als Dialog hat er Platz fuer die Herkunft je Version und raeumt die
 * Kopfzone: Versionen und Quellen sind dieselbe Frage — "worauf beruht das
 * hier" — und werden selten, dafuer bewusst beantwortet.
 *
 * Natives &lt;dialog&gt; per showModal()/close() wie die uebrigen Dialoge
 * (Escape schliesst); die Auswahl einer Version laesst ihn offen, damit der
 * Haken sichtbar wandert.
 */
@Component({
  selector: 'app-grundlage-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grundlage-dialog.html',
})
export class GrundlageDialog {
  protected readonly state = inject(StateService);

  readonly xsdFiles = output<FileList>();
  readonly codelistFiles = output<FileList>();
  readonly xrepClick = output<void>();
  readonly diffClick = output<void>();
  /** Wechsel auf eine hinterlegte Schemaversion (dir aus dem Manifest). */
  readonly bundledPick = output<string>();
  /** Versionsliste von xjustiz.de abrufen/aktualisieren. */
  readonly remoteSchemaClick = output<void>();
  /** Fehlerprotokoll (LoggerService-Ringpuffer) als Datei speichern. */
  readonly logExportClick = output<void>();

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly hasIdx = computed(() => !!this.state.idx());
  protected readonly bundledVersions = computed(() => this.state.bundledVersions());
  protected readonly activeBundle = computed(() => this.state.activeBundle());

  /** Stammt die aktive Version aus dem Abruf von xjustiz.de? */
  private readonly ausXjustizDe = computed(() => {
    const dir = this.state.activeBundle();
    return !!dir && !!this.state.bundledVersions().find((v) => v.dir === dir)?.zipUrl;
  });

  /** Untertitel des Dialogs (verInfo, Profilierer.html Z.980-984). */
  protected readonly verInfo = computed(() => {
    const idx = this.state.idx();
    if (!idx) return 'keine Schemata geladen';
    const ncl = Object.keys(this.state.codelists()).length;
    return (
      `XJustiz ${this.state.version() || '?'}${this.ausXjustizDe() ? ' (xjustiz.de)' : ''} · ` +
      `${this.state.docs().length} Schemata · ` +
      `${idx.messages.length} Nachrichten${ncl ? ' · ' + ncl + ' Codelisten' : ''}`
    );
  });

  protected readonly diffLabel = computed(() => {
    const b = this.state.idxB();
    return b ? `Diff ${this.state.version() || '?'} ↔ ${b.version || '?'}` : 'Version vergleichen…';
  });

  open(): void {
    this.dlg().nativeElement.showModal();
  }

  protected close(): void {
    this.dlg().nativeElement.close();
  }

  /**
   * Tooltip eines Eintrags in der Versionsliste: woher die Version stammt. Bei
   * gespeicherten (von xjustiz.de geholten) ist das die entscheidende Auskunft —
   * sie liegen im Backend und werden nur auf Zuruf aktualisiert.
   */
  protected quellHinweis(v: BundledVersion): string {
    if (!v.zipUrl) return `Im Projekt hinterlegtes Schema (public/schemas/${v.dir})`;
    const woher = v.hinweis ? ` — ${v.hinweis}` : '';
    // Bekannt ist die Version, sobald ihre Bezugsquelle im Speicher steht; die
    // Dateien kommen erst mit dem ersten Waehlen dazu. Beides ist ein
    // Unterschied, den man vor dem Klick wissen will (der Abruf dauert).
    if (!v.files.length)
      return (
        `Auf xjustiz.de veröffentlicht${woher}. Das Schema wird beim ersten Wählen ` +
        'geholt und bleibt danach gespeichert.'
      );
    const wann = v.geholt ? ` am ${new Date(v.geholt).toLocaleDateString('de-DE')}` : '';
    return (
      `Von xjustiz.de geholt${wann}${woher} — ${v.files.length} Schemadateien im Speicher. ` +
      'Aktualisiert wird nur über „Von xjustiz.de aktualisieren".'
    );
  }

  protected pick(input: HTMLInputElement): void {
    input.click();
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
}
