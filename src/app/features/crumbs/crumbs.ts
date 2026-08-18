import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterEveryRender,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { TreeItem, itemPath } from '../../models/node.model';
import { pretty } from '../../core/util/pretty.util';
import { Menu } from '../../shared/menu/menu';

/**
 * Ein Glied der Pfadleiste: entweder eine Station oder die Auslassung, die
 * mehrere Stationen zusammenfasst (`aus`).
 */
export interface Pfadglied {
  key: string;
  it?: TreeItem;
  aus?: TreeItem[];
}

/**
 * Zerlegt die Kette in die anzuzeigenden Glieder: `versteckt` Stationen hinter
 * der Wurzel weichen einer Auslassung, mit `wurzelAus` auch die Wurzel selbst.
 * Ausgelassen wird von der Wurzel her — der nahe Kontext des ausgewaehlten
 * Elements bleibt am laengsten stehen, das Element selbst immer.
 * Reine Funktion, damit die Aufteilung ohne DOM pruefbar ist.
 */
export function gliedere(kette: TreeItem[], versteckt: number, wurzelAus = false): Pfadglied[] {
  const glied = (it: TreeItem): Pfadglied => ({ key: itemPath(it), it });
  const wurzel = kette[0];
  const ziel = kette[kette.length - 1];
  if (!wurzel || !ziel) return [];
  if (wurzelAus && kette.length > 1) {
    return [{ key: `aus:${itemPath(wurzel)}:alle`, aus: kette.slice(0, -1) }, glied(ziel)];
  }
  const n = Math.min(Math.max(0, versteckt), Math.max(0, kette.length - 2));
  if (n === 0) return kette.map(glied);
  return [
    glied(wurzel),
    { key: `aus:${itemPath(wurzel)}:${n}`, aus: kette.slice(1, 1 + n) },
    ...kette.slice(1 + n).map(glied),
  ];
}

/**
 * Pfadleiste (renderCrumbs, Profilierer.html Z.243, 777-792): klickbare Kette
 * Wurzel → ausgewaehltes Element.
 *
 * Der Pfad ist Orientierung und Navigationselement zugleich und muss auch im
 * schmalen Fenster sichtbar bleiben. Frueher lief die Kette einfach aus der
 * Ortszone heraus und wurde rechts abgeschnitten — ausgerechnet das aktuelle
 * Element verschwand zuerst. Jetzt misst die Komponente den vorhandenen Platz
 * und faltet ueberzaehlige Stationen in ein Auslassungs-Menue ein; Wurzel und
 * aktuelles Element bleiben stehen, notfalls (Klasse `eng`) gekuerzt.
 */
@Component({
  selector: 'app-crumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Menu],
  templateUrl: './crumbs.html',
})
export class Crumbs {
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly leiste = viewChild<ElementRef<HTMLElement>>('leiste');

  protected readonly chain = computed<TreeItem[]>(() => {
    const sel = this.state.selItem();
    if (!this.state.root() || !sel) return [];
    return this.nav.findChainByPath(itemPath(sel));
  });

  /** Wie viele Stationen hinter der Wurzel derzeit in der Auslassung stecken. */
  private readonly versteckt = signal(0);
  /**
   * Auch die Wurzel ist eingefaltet — sie steht als Nachrichtenname ohnehin
   * im Knopf daneben, das ausgewaehlte Element dagegen nirgends sonst.
   */
  private readonly wurzelAus = signal(false);
  /** Selbst dann zu breit: die verbliebenen Stationen duerfen kuerzen. */
  protected readonly eng = signal(false);

  protected readonly glieder = computed<Pfadglied[]>(() =>
    gliedere(this.chain(), this.versteckt(), this.wurzelAus()),
  );

  private ro?: ResizeObserver;
  private letzteBreite = -1;

  constructor() {
    // Andere Auswahl -> Aufteilung von vorn messen.
    effect(() => {
      this.chain();
      this.aufFalten();
    });

    afterNextRender(() => {
      const el = this.leiste()?.nativeElement;
      if (el && 'ResizeObserver' in window) {
        this.ro = new ResizeObserver(() => {
          // Nur echte Breitenaenderungen, sonst rechnete sich das Auffalten
          // mit dem eigenen Layout im Kreis.
          if (el.clientWidth === this.letzteBreite) return;
          this.letzteBreite = el.clientWidth;
          this.aufFalten();
        });
        this.ro.observe(el);
      }
    });

    // Nach jedem Rendern pruefen: passt die Kette noch? Ein Schritt je
    // Durchgang, der naechste Durchgang folgt durch das eigene Signal.
    afterEveryRender(() => this.falteSchritt());

    inject(DestroyRef).onDestroy(() => this.ro?.disconnect());
  }

  /** Von vorn: erst alles zeigen, dann erneut einfalten, was nicht passt. */
  private aufFalten(): void {
    this.versteckt.set(0);
    this.wurzelAus.set(false);
    this.eng.set(false);
  }

  /**
   * Ein Faltschritt, falls die Kette breiter ist als ihre Zone: erst wandert
   * eine weitere Station in die Auslassung, dann die Wurzel, erst zuletzt wird
   * gekuerzt — Namen bleiben so lange lesbar wie moeglich. Monoton, die Stufen
   * gehen nur vorwaerts: kein Flattern, garantiertes Ende der Durchgaenge.
   */
  private falteSchritt(): void {
    const el = this.leiste()?.nativeElement;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    if (this.versteckt() < this.chain().length - 2) {
      this.versteckt.update((v) => v + 1);
      return;
    }
    if (!this.wurzelAus() && this.chain().length > 1) {
      this.wurzelAus.set(true);
      return;
    }
    if (!this.eng()) this.eng.set(true);
  }

  protected keyOf(it: TreeItem): string {
    return itemPath(it);
  }

  protected label(it: TreeItem): string {
    return it.kind === 'ausp' ? it.ausp.name : pretty(it.node.name);
  }

  protected titleOf(it: TreeItem): string {
    return it.kind === 'el' ? it.node.name : 'Ausprägung';
  }

  /** Tooltip der Auslassung: die uebersprungenen Stationen im Klartext. */
  protected ausTitel(items: TreeItem[]): string {
    return `Übersprungen: ${items.map((it) => this.label(it)).join(' › ')}`;
  }

  protected istLetztes(g: Pfadglied): boolean {
    const glieder = this.glieder();
    return glieder[glieder.length - 1] === g;
  }

  protected pick(it: TreeItem): void {
    this.nav.selectItem(it);
  }
}
