import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/**
 * Dropdown-Menue fuer Kopf-/Werkzeugleiste (Popover-Muster wie MessagePicker).
 * Inhalt wird projiziert; Eintraege schliessen das Menue selbst via close()
 * (Template-Referenz), Checkbox-Eintraege lassen es offen.
 */
@Component({
  selector: 'app-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu.html',
})
export class Menu {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  /** Tooltip des Menue-Knopfes (z.B. die Schema-Diagnose am Datenbasis-Menue). */
  readonly titel = input('');
  /**
   * Ersatzbeschriftung fuer schmale Fenster (Breakpoint ~1280px, s. styles.scss):
   * unterhalb weicht `label` diesem Kurztext. Leer = Beschriftung faellt ganz weg.
   */
  readonly kurz = input('');
  /** Zusatzklassen des Menue-Knopfes (Breakpoint-Steuerung der Kopfzone). */
  readonly btnClass = input('');
  /** Aufklapp-Pfeil zeigen; aus, wo das Label selbst schon Menue signalisiert (⋯). */
  readonly pfeil = input(true);

  protected readonly open = signal(false);
  protected readonly pos = signal<{ left: number; top: number }>({ left: 0, top: 0 });

  protected toggle(btn: HTMLElement): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const r = btn.getBoundingClientRect();
    // Nicht rechts aus dem Viewport ragen (Panel max-width 320px, s. styles.scss)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 328));
    this.pos.set({ left, top: r.bottom + 4 });
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }
}
