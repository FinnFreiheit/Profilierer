import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { StateService } from '../../core/services/state.service';

/**
 * Profil-Details (metaDlg, Profilierer.html Z.286-295, btnMeta/mOk Z.2417-2432).
 */
@Component({
  selector: 'app-meta-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './meta-dialog.html',
})
export class MetaDialog {
  private readonly state = inject(StateService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly mName = signal('');
  protected readonly mAutor = signal('');
  protected readonly mDatum = signal('');
  protected readonly mBeschr = signal('');

  open(): void {
    const m = this.state.meta();
    this.mName.set(m.name || '');
    this.mAutor.set(m.autor || '');
    this.mDatum.set(m.datum || new Date().toLocaleDateString('de-DE'));
    this.mBeschr.set(m.beschreibung || '');
    this.dlg().nativeElement.showModal();
  }

  protected submit(): void {
    this.state.patchMeta({
      name: this.mName().trim(),
      autor: this.mAutor().trim(),
      datum: this.mDatum().trim(),
      beschreibung: this.mBeschr().trim(),
    });
    this.dlg().nativeElement.close();
  }
}
