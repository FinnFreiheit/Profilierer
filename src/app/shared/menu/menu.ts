import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

/** Lage des Panels zum Knopf. */
export type MenuPos = { left: number; top: number; bottom: number; breite: number };

/** Ausrichtung des Panels am Knopf. */
export type MenuAusrichtung = 'links' | 'rechts';

/**
 * Linke Kante des Panels. Rechtsbuendig liegt seine **rechte** Kante auf der
 * des Knopfes, linksbuendig seine linke auf dessen linker; beides so geklemmt,
 * dass nichts aus dem Fenster ragt. Reine Rechnung, damit die Regel ohne
 * Layout pruefbar ist.
 */
export function menuLinkeKante(
  knopf: { left: number; right: number },
  breite: number,
  ausrichtung: MenuAusrichtung,
  fensterBreite: number,
): number {
  return ausrichtung === 'rechts'
    ? Math.max(8, knopf.right - breite)
    : Math.max(8, Math.min(knopf.left, fensterBreite - breite - 8));
}

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
  /**
   * Aufklapp-Richtung. `oben` fuer Knoepfe am unteren Rand (Hilfe der
   * Fusszeile): das Panel haengt ueber dem Knopf, der Pfeil zeigt hinauf.
   */
  readonly richtung = input<'unten' | 'oben'>('unten');
  /**
   * Groesste Panel-Breite. Steuert zugleich die Klemmung am Viewport-Rand,
   * damit das Panel nicht aus dem Fenster ragt.
   */
  readonly breite = input(320);
  /**
   * Ausrichtung des Panels am Knopf. `rechts` fuer Knoepfe am rechten Rand
   * (⋯, Ansicht, Hilfe): die rechte Kante des Panels liegt auf der des Knopfes.
   */
  readonly ausrichtung = input<MenuAusrichtung>('links');

  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly open = signal(false);
  protected readonly pos = signal<MenuPos>({ left: 0, top: 0, bottom: 0, breite: 320 });

  protected toggle(btn: HTMLElement): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const r = btn.getBoundingClientRect();
    // Nie breiter als das Fenster — sonst klemmt die Ausrichtung ins Leere.
    const breite = Math.min(this.breite(), window.innerWidth - 16);
    this.pos.set({
      left: menuLinkeKante(r, breite, this.ausrichtung(), window.innerWidth),
      top: r.bottom + 4,
      bottom: window.innerHeight - r.top + 4,
      breite,
    });
    this.open.set(true);
    if (this.ausrichtung() === 'rechts') this.richteRechtsAus(r);
  }

  /**
   * `breite` ist nur die **Obergrenze** (`max-width`): ein schmaler Inhalt
   * macht das Panel schmaler, und rechtsbuendig gerechnet laege seine rechte
   * Kante dann links vom Knopf — das Menue haenge sichtbar daneben. Erst die
   * gemessene Breite sagt, wohin es gehoert; gemessen wird nach dem Rendern.
   */
  private richteRechtsAus(knopf: DOMRect): void {
    afterNextRender(
      () => {
        const el = this.panel()?.nativeElement;
        if (!el) return;
        const ist = el.getBoundingClientRect().width;
        if (ist <= 0) return; // nichts gemessen: die Obergrenze bleibt stehen
        this.pos.update((p) => ({
          ...p,
          left: menuLinkeKante(knopf, ist, 'rechts', window.innerWidth),
        }));
      },
      { injector: this.injector },
    );
  }

  close(): void {
    this.open.set(false);
  }
}
