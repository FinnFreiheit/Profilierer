import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { ErweiterungDialogService } from '../../core/services/erweiterung-dialog.service';
import { ERW_NAME_MUSTER } from '../../core/profile-defaults';
import { DatentypPicker } from '../datentyp-picker/datentyp-picker';
import { DatentypWahl, erwTypVorgabe } from '../../core/util/datentyp.util';

/**
 * Formular-Dialog zum Anlegen einer Schema-Erweiterung (US Schema-Erweiterung).
 * Einmal in der App-Shell gemountet; geoeffnet ueber den
 * ErweiterungDialogService (Muster meta-dialog + ValidationReportService).
 */
@Component({
  selector: 'app-erweiterung-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './erweiterung-dialog.html',
  imports: [DatentypPicker],
})
export class ErweiterungDialog {
  private readonly state = inject(StateService);
  private readonly svc = inject(ErweiterungDialogService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly eName = signal('');
  protected readonly eBeschr = signal('');
  protected readonly eMin = signal('1');
  protected readonly eMax = signal('1');
  /** Datentyp samt Herkunft — beides kommt aus dem Typwaehler (#96). */
  protected readonly eTyp = signal<DatentypWahl>(erwTypVorgabe(null));

  /** Blockierender Formfehler (Elementname), sonst null. */
  protected readonly nameProblem = computed<string | null>(() => {
    const n = this.eName().trim();
    if (!n) return 'Name fehlt.';
    if (!ERW_NAME_MUSTER.test(n))
      return 'Kein gültiger XML-Elementname (Buchstabe/_ am Anfang, keine Leer- oder Sonderzeichen).';
    return null;
  });

  /** Nicht-blockierende Warnung bei Namensgleichheit mit vorhandenen Kindern. */
  protected readonly kollision = computed(() => {
    const a = this.svc.anfrage();
    const n = this.eName().trim();
    return !!a && !!n && a.vorhandeneNamen.includes(n);
  });

  constructor() {
    effect(() => {
      const a = this.svc.anfrage();
      if (!a) return;
      this.eName.set('');
      this.eBeschr.set('');
      this.eMin.set('1');
      this.eMax.set('1');
      this.eTyp.set(erwTypVorgabe(this.state.idx()));
      this.dlg().nativeElement.showModal();
    });
  }

  protected onClose(): void {
    this.svc.schliesse();
  }

  protected abbrechen(): void {
    this.dlg().nativeElement.close();
  }

  protected submit(): void {
    const a = this.svc.anfrage();
    if (!a || this.nameProblem()) return;
    const min = this.eMin().trim() || '1';
    const maxRoh = this.eMax().trim() || '1';
    const max = maxRoh === '*' ? 'unbounded' : maxRoh;
    this.state.addErweiterung(a.parentPath, {
      name: this.eName().trim(),
      beschreibung: this.eBeschr().trim() || undefined,
      min,
      max,
      ...this.eTyp(),
    });
    this.state.setOpen(a.parentPath, true);
    this.dlg().nativeElement.close();
  }
}
