import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RolleService } from '../../core/services/rolle.service';

/**
 * Rollen-Badge mit An-/Abmeldung der BLK-AG (Abnahme-Story): zeigt die aktive
 * AG-Rolle dauerhaft als Badge und bietet den Anmelde-Dialog fuer den
 * gemeinsamen AG-Schluessel. Eingebunden in Dashboard-, Testdaten-Kopf und
 * Topbar, damit die Rolle in jeder Ansicht sichtbar bleibt.
 */
@Component({
  selector: 'app-rolle-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rolle-badge.html',
})
export class RolleBadge {
  protected readonly rolle = inject(RolleService);
  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly key = signal('');
  protected readonly fehler = signal('');
  protected readonly busy = signal(false);
  /**
   * Steuert, ob der Dialog im DOM steht — nicht nur, ob er sichtbar ist. Das
   * Passwortfeld darf beim Arbeiten am Baum nicht auf der Seite liegen
   * (Begruendung im Template).
   */
  protected readonly offen = signal(false);

  constructor() {
    // `showModal()` erst, wenn Angular das Dialog-Element gerendert hat.
    effect(() => {
      const el = this.dlg()?.nativeElement;
      if (el && !el.open) el.showModal();
    });
  }

  protected openDlg(): void {
    this.key.set('');
    this.fehler.set('');
    this.offen.set(true);
  }

  protected async anmelden(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const out = await this.rolle.anmelden(this.key());
      if (out === 'ok') this.dlg()?.nativeElement.close();
      else if (out === 'falsch') this.fehler.set('Schlüssel nicht korrekt — bitte Eingabe prüfen.');
      else
        this.fehler.set(
          'Auf dieser Instanz ist keine AG-Rolle konfiguriert (XJP_AG_KEY nicht gesetzt) — Anmeldung nicht möglich.',
        );
    } catch {
      this.fehler.set('Anmeldung nicht möglich — Backend nicht erreichbar.');
    } finally {
      this.busy.set(false);
    }
  }

  protected abmelden(): void {
    this.rolle.abmelden();
  }
}
