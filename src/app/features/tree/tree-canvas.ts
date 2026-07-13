import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TreeNode } from './tree-node';
import { TreeService } from '../../core/services/tree.service';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { itemPath } from '../../models/node.model';
import { REF_TARGETS } from '../../core/refs';

interface PathSpec {
  d: string;
  stroke: string;
  width: string;
  dash: string | null;
  opacity: string | null;
  markerEnd: string | null;
}

/** Herkunfts-Beschriftung auf einer langen Verbindungslinie (Name des Elternknotens). */
interface LabelSpec {
  x: number;
  y: number;
  text: string;
  onP: boolean;
  path: string;
}

/** Ab dieser horizontalen Linienlaenge (px) wird die Herkunft auf die Linie geschrieben. */
const LABEL_MIN_LEN = 400;

/**
 * Der scrollbare Baum-Bereich (#treeCanvas) mit dem SVG-Overlay der
 * Verbindungslinien. Deklarative Portierung von renderColumns/redrawLines
 * (Z.1066-1206): die Bezier-/Referenz-Geometrie wird nahezu unveraendert aus
 * DOM-Messungen berechnet und als PathSpec[] gerendert. Neuberechnung bei
 * Struktur-/Auswahl-/Profil-Aenderung (effect), bei Groessenaenderung
 * (ResizeObserver) und beim ersten Render (afterNextRender). Optional richtet
 * `alignLeaves` (Schalter „Blätter ausrichten") alle Blaetter linksbuendig auf
 * der tiefsten Spalte aus; ohne den Schalter sitzt jedes Blatt direkt neben
 * seinem Elternknoten (kurze Wege, klare Herkunft).
 */
@Component({
  selector: 'app-tree-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TreeNode],
  templateUrl: './tree-canvas.html',
})
export class TreeCanvas {
  private readonly tree = inject(TreeService);
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly rootItem = computed(() => this.tree.rootItem());
  protected readonly paths = signal<PathSpec[]>([]);
  protected readonly labels = signal<LabelSpec[]>([]);
  protected readonly svgSize = signal<{ w: number; h: number }>({ w: 0, h: 0 });

  private rafId = 0;
  private ro?: ResizeObserver;

  constructor() {
    // Struktur-/Auswahl-/Profil-/Ansichts-Aenderungen -> Neuberechnung.
    effect(() => {
      this.rootItem();
      this.state.open();
      this.state.selItem();
      this.state.elemente();
      this.state.auspraegungen();
      this.state.showRefs();
      this.state.showDiff();
      this.state.showTech();
      this.state.focusMode();
      this.state.alignLeaves();
      this.scheduleRedraw();
    });

    afterNextRender(() => {
      const canvas = this.canvas();
      if (canvas && 'ResizeObserver' in window) {
        this.ro = new ResizeObserver(() => this.scheduleRedraw());
        this.ro.observe(canvas);
      }
      this.scheduleRedraw();
    });

    inject(DestroyRef).onDestroy(() => {
      this.ro?.disconnect();
      if (this.rafId) cancelAnimationFrame(this.rafId);
    });

    // Scroll-/Flash-Anforderung (scrollToPath, Z.682-691).
    effect(() => {
      const t = this.state.scrollTarget();
      if (!t) return;
      requestAnimationFrame(() => {
        const canvas = this.canvas();
        if (!canvas) return;
        for (const b of Array.from(canvas.querySelectorAll<HTMLElement>('.box'))) {
          if (b.dataset['path'] === t.path) {
            b.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
            b.classList.add('flash');
            setTimeout(() => b.classList.remove('flash'), 1400);
            break;
          }
        }
      });
    });
  }

  private canvas(): HTMLElement | null {
    return this.host.nativeElement.querySelector('#treeCanvas');
  }

  /** Klick auf eine Herkunfts-Beschriftung: zum Elternknoten springen. */
  protected onLabelClick(path: string, e: Event): void {
    e.stopPropagation();
    this.nav.jumpTo(path);
  }

  private scheduleRedraw(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.redraw();
    });
  }

  /** Setzt eine zuvor angewandte Blatt-Ausrichtung zurueck (Blatt wieder direkt am Elternknoten). */
  private resetLeafMargins(canvas: HTMLElement): void {
    for (const t of Array.from(canvas.querySelectorAll<HTMLElement>('.ntree'))) {
      const box = t.children[0] as HTMLElement | undefined;
      if (box && box.classList.contains('box')) box.style.marginLeft = '';
    }
  }

  /**
   * Visuelle Anforderung (optional, Schalter „Blätter ausrichten"): alle
   * Blaetter auf dieselbe (tiefste) Spalte, linksbuendig. Echte Blaetter sind
   * Boxen ohne Aufklapp-Button (`.togBtn` gibt es nur bei Knoten mit Kindern —
   * eingeklappte Aeste zaehlen daher bewusst NICHT als Blatt). Jedes Blatt wird
   * per `margin-left` bis zur linken Kante des am weitesten rechts liegenden
   * Blatts geschoben; die Verbindungslinien folgen automatisch, da sie aus der
   * DOM-Geometrie berechnet werden.
   */
  private alignLeaves(canvas: HTMLElement): void {
    const boxes: HTMLElement[] = [];
    for (const t of Array.from(canvas.querySelectorAll<HTMLElement>('.ntree'))) {
      const box = t.children[0] as HTMLElement | undefined;
      if (!box || !box.classList.contains('box')) continue;
      box.style.marginLeft = ''; // vorherige Ausrichtung zuruecksetzen
      boxes.push(box);
    }
    const leaves = boxes.filter((b) => !b.querySelector('.togBtn'));
    if (leaves.length < 2) return;
    // Natuerliche Positionen messen (nach dem Reset), dann buendig schieben.
    let maxLeft = -Infinity;
    const lefts = new Map<HTMLElement, number>();
    for (const b of leaves) {
      const l = b.getBoundingClientRect().left;
      lefts.set(b, l);
      if (l > maxLeft) maxLeft = l;
    }
    for (const b of leaves) {
      const d = maxLeft - lefts.get(b)!;
      if (d > 0.5) b.style.marginLeft = `${d}px`;
    }
  }

  private onSelPath(p: string): boolean {
    const sel = this.state.selItem();
    if (!sel) return false;
    const sp = itemPath(sel);
    return sp === p || sp.startsWith(p + '/') || sp.startsWith(p + '@');
  }

  /** redrawLines (Z.1125-1206). */
  private redraw(): void {
    const canvas = this.canvas();
    if (!canvas || !this.state.root()) {
      this.paths.set([]);
      return;
    }
    // Blatt-Ausrichtung (optional) vor der Vermessung — schiebt Endknoten nach
    // rechts, aendert damit scrollWidth und die Box-Geometrie der Linien. Ohne
    // Ausrichtung sitzt jedes Blatt direkt neben seinem Elternknoten (kurze Wege).
    if (this.state.alignLeaves()) this.alignLeaves(canvas);
    else this.resetLeafMargins(canvas);
    const W = canvas.scrollWidth;
    const H = canvas.scrollHeight;
    this.svgSize.set({ w: W, h: H });
    const cr = canvas.getBoundingClientRect();
    const out: PathSpec[] = [];
    const labelsOut: LabelSpec[] = [];

    // Eltern-Kind-Linien.
    for (const t of Array.from(canvas.querySelectorAll('.ntree'))) {
      const from = t.children[0] as HTMLElement | undefined;
      if (!from || !from.classList.contains('box')) continue;
      const kids = t.querySelector(':scope > .nkids');
      if (!kids) continue;
      const fr = from.getBoundingClientRect();
      const x1 = fr.right - cr.left;
      const y1 = fr.top + Math.min(fr.height / 2, 22) - cr.top;
      const fromName = (from.querySelector('.bname')?.textContent || '').trim();
      const targets = [
        ...Array.from(kids.querySelectorAll(':scope > .ntree > .box')),
        ...Array.from(kids.querySelectorAll(':scope > .box.addBox')),
      ] as HTMLElement[];
      for (const to of targets) {
        const tr = to.getBoundingClientRect();
        const x2 = tr.left - cr.left;
        const y2 = tr.top + Math.min(tr.height / 2, 22) - cr.top;
        const onP = !!to.dataset['path'] && this.onSelPath(to.dataset['path']!);
        const excl = to.classList.contains('excluded') || to.classList.contains('exclInherit');
        // Orthogonales Routing: gemeinsamer vertikaler "Bus" im Spalt hinter
        // dem Elternknoten, dann gerade Horizontale auf Kindhoehe. Dadurch
        // ueberlagern nach rechts ausgerichtete Blaetter keine anderen Boxen.
        const busX = x1 + 20;
        const dy = y2 - y1;
        let d: string;
        if (Math.abs(dy) < 0.5) {
          d = `M ${x1} ${y1} H ${x2}`;
        } else {
          const s = Math.sign(dy);
          const r = Math.min(8, Math.abs(dy) / 2, (x2 - busX) / 2);
          d =
            `M ${x1} ${y1} H ${busX - r} ` +
            `Q ${busX} ${y1} ${busX} ${y1 + s * r} ` +
            `V ${y2 - s * r} ` +
            `Q ${busX} ${y2} ${busX + r} ${y2} ` +
            `H ${x2}`;
        }
        out.push({
          d,
          stroke: onP ? 'var(--accent)' : '#c3ccd8',
          width: onP ? '2.2' : '1.4',
          dash: excl ? '4 4' : null,
          opacity: null,
          markerEnd: null,
        });

        // Herkunft auf lange Linien schreiben: bei weit nach rechts
        // ausgerichteten Blaettern ist der Elternknoten sonst ausserhalb
        // des Sichtfelds. Label knapp vor dem Blatt, auf der Linie.
        const fromPath = from.dataset['path'];
        if (fromName && fromPath && x2 - x1 > LABEL_MIN_LEN) {
          const text = fromName.length > 30 ? fromName.slice(0, 29) + '…' : fromName;
          labelsOut.push({ x: x2 - 10, y: y2, text: '‹ ' + text, onP, path: fromPath });
        }
      }
    }

    // Verweislinien.
    const byPath = new Map<string, HTMLElement>();
    for (const b of Array.from(canvas.querySelectorAll<HTMLElement>('.box')))
      if (b.dataset['path']) byPath.set(b.dataset['path'], b);

    const nearestBox = (path: string): { box: HTMLElement; exact: boolean } | null => {
      let p = path;
      while (p) {
        const b = byPath.get(p);
        if (b) return { box: b, exact: p === path };
        const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('@'));
        if (cut < 0) return null;
        p = p.slice(0, cut);
      }
      return null;
    };
    const refCurve = (from: HTMLElement, to: HTMLElement, strong: boolean, exact: boolean): PathSpec => {
      const fr = from.getBoundingClientRect();
      const tr = to.getBoundingClientRect();
      const x1 = fr.right - cr.left;
      const y1 = fr.top + fr.height / 2 - cr.top;
      const x2 = tr.right - cr.left;
      const y2 = tr.top + tr.height / 2 - cr.top;
      const bulge = Math.max(x1, x2) + 50 + Math.min(130, Math.abs(y2 - y1) / 6);
      return {
        d: `M ${x1} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x2 + 6} ${y2}`,
        stroke: strong ? '#d4537e' : '#e8a8c0',
        width: strong ? '1.8' : '1.2',
        dash: strong ? '6 4' : '2 5',
        opacity: exact ? null : '0.6',
        markerEnd: `url(#${strong ? 'refArr' : 'refArrL'})`,
      };
    };

    const drawn = new Set<string>();
    // 1) zugeordnete Verweisziele (kraeftig).
    for (const [path, p] of Object.entries(this.state.elemente())) {
      if (!p.refZiel) continue;
      const from = byPath.get(path);
      if (!from) continue;
      const t = nearestBox(p.refZiel);
      if (!t) continue;
      out.push(refCurve(from, t.box, true, t.exact));
      drawn.add(path);
    }
    // 2) Schema-Verweise ohne Zuordnung (dezent).
    if (this.state.showRefs()) {
      for (const [path, b] of byPath) {
        const rk = b.dataset['refkind'];
        if (!rk || b.dataset['refziel'] || drawn.has(path)) continue;
        const names = REF_TARGETS[rk];
        if (!names) continue;
        for (const [tp, tb] of byPath) {
          const lastSeg = tp.split('/').pop()!;
          if (lastSeg.includes('@')) continue;
          if (!names.includes(lastSeg.split('#')[0]!)) continue;
          out.push(refCurve(b, tb, false, true));
        }
      }
    }

    this.paths.set(out);
    this.labels.set(labelsOut);
  }
}
