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
