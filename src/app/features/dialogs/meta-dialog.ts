import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { TagEingabe } from '../../shared/tag-eingabe/tag-eingabe';
import { normalisiereTags, tagOptionen, tagsAlsText } from '../../core/util/tags.util';

/**
 * Profil-Details (metaDlg, Profilierer.html Z.286-295, btnMeta/mOk Z.2417-2432).
 */
@Component({
  selector: 'app-meta-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './meta-dialog.html',
  imports: [KeinAutofillDirective, TagEingabe],
})
export class MetaDialog {
  private readonly state = inject(StateService);
  private readonly store = inject(ProfileStoreService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly mName = signal('');
  protected readonly mAutor = signal('');
  protected readonly mDatum = signal('');
  protected readonly mBeschr = signal('');
  /** Schlagworte als kommagetrennter Text (siehe TagEingabe). */
  protected readonly mTags = signal('');

  /** Schon vergebene Schlagworte der Bibliothek — Vorschlaege im Feld. */
  protected readonly tagVorschlaege = computed(() =>
    tagOptionen(this.store.entries(), (e) => e.tags),
  );

  open(): void {
    const m = this.state.meta();
    this.mName.set(m.name || '');
    this.mAutor.set(m.autor || '');
    this.mDatum.set(m.datum || new Date().toLocaleDateString('de-DE'));
    this.mBeschr.set(m.beschreibung || '');
    this.mTags.set(tagsAlsText(m.tags));
    this.dlg().nativeElement.showModal();
  }

  protected submit(): void {
    this.state.patchMeta({
      name: this.mName().trim(),
      autor: this.mAutor().trim(),
      datum: this.mDatum().trim(),
      beschreibung: this.mBeschr().trim(),
      tags: normalisiereTags(this.mTags()),
    });
    this.dlg().nativeElement.close();
  }
}
