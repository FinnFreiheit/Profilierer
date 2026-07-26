import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Kontextmenue am Baumknoten (Rechtsklick): Teilbaum aus-/einklappen.
 * Bewusst ohne CDK — ein fix positioniertes Div an clientX/clientY, das am
 * Viewport-Rand umklappt statt abzuschneiden. Schliesst bei Klick ausserhalb,
 * Escape, Scroll und (durch den Aufrufer) bei Auswahl eines Eintrags.
 */
@Component({
  selector: 'app-tree-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tree-context-menu.html',
  host: {
    '(document:pointerdown)': 'onDocPointerdown($event)',
    '(document:contextmenu)': 'onDocPointerdown($event)',
    '(document:keydown.escape)': 'geschlossen.emit()',
  },
})
export class TreeContextMenu {
  /** Mausposition des Rechtsklicks (Viewport-Koordinaten). */
  readonly x = input.required<number>();
  readonly y = input.required<number>();

  readonly ausklappen = output<void>();
  readonly einklappen = output<void>();
  readonly geschlossen = output<void>();

  private readonly el: ElementRef<HTMLElement> = inject(ElementRef);

  /** Endposition nach der Rand-Umklappung; bis zur Vermessung unsichtbar. */
  protected readonly pos = signal<{ left: number; top: number } | null>(null);

  constructor() {
    // Scroll schliesst das Menue — capture, damit auch der innere
    // Baum-Container (#treeWrap) erfasst wird (scroll bubbelt nicht).
    const onScroll = (): void => this.geschlossen.emit();
    window.addEventListener('scroll', onScroll, true);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('scroll', onScroll, true));

    afterNextRender(() => {
      const m = this.el.nativeElement.querySelector<HTMLElement>('.ctxMenu');
      if (!m) return;
      const r = m.getBoundingClientRect();
      let left = this.x();
      let top = this.y();
      if (left + r.width > window.innerWidth) left = Math.max(0, left - r.width);
      if (top + r.height > window.innerHeight) top = Math.max(0, top - r.height);
      this.pos.set({ left, top });
    });
  }

  /** Klick oder Rechtsklick ausserhalb des Menues schliesst es. */
  protected onDocPointerdown(e: Event): void {
    if (!this.el.nativeElement.contains(e.target as Node)) this.geschlossen.emit();
  }
}
