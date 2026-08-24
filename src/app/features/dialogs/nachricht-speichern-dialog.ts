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
import { NachrichtSpeichernService } from '../../core/services/nachricht-speichern.service';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/**
 * Rueckfrage beim Verlassen der Baumansicht: soll die offene (hochgeladene)
 * Testnachricht in den Testdaten-Speicher? Der Name ist dabei anpassbar — der
 * Dateiname ist nur ein Vorschlag, und ein zweiter Dialog dafuer waere ein
 * Schritt zu viel.
 *
 * Einmal in der App-Shell gemountet; geoeffnet ueber den
 * NachrichtSpeichernService (Muster app-erweiterung-dialog).
 */
@Component({
  selector: 'app-nachricht-speichern-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nachricht-speichern-dialog.html',
  imports: [KeinAutofillDirective],
})
export class NachrichtSpeichernDialog {
  private readonly svc = inject(NachrichtSpeichernService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly feld = viewChild.required<ElementRef<HTMLInputElement>>('feld');

  protected readonly name = signal('');
  protected readonly leer = computed(() => !this.name().trim());

  constructor() {
    effect(() => {
      const a = this.svc.anfrage();
      if (!a) return;
      this.name.set(a.vorschlag);
      this.dlg().nativeElement.showModal();
      // Der Vorschlag steht markiert im Feld: uebernehmen heisst Enter, aendern
      // heisst tippen — der haeufigste Handgriff kostet keinen Klick. Erst nach
      // dem Rendern, sonst markierte es den Wert von vorher.
      queueMicrotask(() => this.feld().nativeElement.select());
    });
  }

  /**
   * Esc oder Klick auf den Hintergrund: die Frage bleibt unbeantwortet, also
   * wird nichts verlassen. Nach einer Antwort laeuft der Aufruf ins Leere (der
   * Aufloeser ist dann schon verbraucht).
   */
  protected onClose(): void {
    this.svc.antworte({ art: 'abbrechen' });
  }

  protected speichern(): void {
    if (this.leer()) return;
    this.svc.antworte({ art: 'speichern', name: this.name().trim() });
    this.dlg().nativeElement.close();
  }

  protected verwerfen(): void {
    this.svc.antworte({ art: 'verwerfen' });
    this.dlg().nativeElement.close();
  }

  protected abbrechen(): void {
    this.svc.antworte({ art: 'abbrechen' });
    this.dlg().nativeElement.close();
  }
}
