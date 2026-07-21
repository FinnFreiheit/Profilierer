import { Injectable, inject } from '@angular/core';
import { TreeItem, itemPath } from '../../models/node.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { DiffService } from './diff.service';

/**
 * Nachrichtenauswahl und Baum-Navigation. Portiert aus Profilierer.html
 * (loadMessage Z.1732-1743, expandAllTree/collapseTree Z.1437-1451,
 * findChainByPath/findItemByPath/openAncestors/selectItem Z.744-793).
 * Scroll-Effekte (scrollToPath/jumpTo) liegen im TreeCanvas (View-nah).
 */
@Injectable({ providedIn: 'root' })
export class NavService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly diff = inject(DiffService);

  /** loadMessage (Z.1732-1743): Nachricht laden und Baum aufbauen. */
  loadMessage(name: string, keepProfile = false): void {
    const idx = this.state.idx();
    if (!idx) return;
    const schemaView = this.state.schemaView();
    this.state.msgName.set(name);
    this.state.root.set(this.tree.buildRoot(name, idx));
    if (!keepProfile) {
      this.state.resetProfile();
      // resetProfile beendet die Schema-Ansicht (loadProfile); bei der
      // Nachrichtenwahl innerhalb der Schema-Ansicht bleibt sie bestehen.
      if (schemaView) {
        this.state.schemaView.set(true);
        this.state.readOnly.set(true);
      }
    }
    const root = this.state.root()!;
    this.state.selItem.set({ kind: 'el', node: root });
    this.state.open.set(new Set([root.path]));
    // Diff-Karte auf die neue Nachricht beziehen (sonst blieben die Marker
    // der zuvor geladenen Nachricht stehen).
    if (this.state.idxB()) this.diff.computeDiffMap();
    // Validierungsmarker gehoeren zur zuvor geprueften Nachricht (bei
    // keepProfile laeuft loadProfile nicht — daher auch hier raeumen).
    this.state.clearValidierungsMarker();
  }

  /**
   * US "Schema ansehen": Editor als reine Schema-Ansicht oeffnen — Nachricht
   * waehlen, Baum betrachten, suchen. Es wird keine Profilierung angelegt und
   * nichts gespeichert (activeProfileId bleibt null → kein Autosave); alle
   * Profilier-Bedienelemente sind gesperrt (readOnly).
   */
  openSchemaView(): void {
    this.state.activeProfileId.set(null);
    this.state.msgName.set(null);
    this.state.root.set(null);
    this.state.resetProfile();
    this.state.guided.set(false);
    this.state.schemaView.set(true);
    this.state.readOnly.set(true);
    this.state.view.set('editor');
  }

  /**
   * Belegt alle unbedingten Pflichtelemente der aktuellen Nachricht mit dem
   * "zwingend"-Status (Wirkung `pflicht`) vor — nicht-destruktiv (bestehende
   * Status bleiben). Gibt die Anzahl neu gesetzter Elemente zurueck.
   */
  prefillMandatoryStatus(): number {
    const root = this.state.root();
    const pflicht = this.state.pflichtStatus();
    if (!root || !pflicht) return 0;
    return this.state.prefillStatus(this.tree.collectMandatoryPaths(root), pflicht.id);
  }

  /** expandAllTree (Z.1437-1447): alle Aeste aufklappen (mit Schutzgrenzen). */
  expandAllTree(): void {
    const next = new Set(this.state.open());
    let count = 0;
    const rec = (it: TreeItem, depth: number): void => {
      if (depth > 25 || count > 5000) return;
      if (!this.tree.itemHasKids(it)) return;
      next.add(itemPath(it));
      count++;
      for (const c of this.tree.childItems(it)) rec(c, depth + 1);
    };
    const root = this.tree.rootItem();
    if (root) rec(root, 0);
    this.state.open.set(next);
  }

  /** collapseTree (Z.1448-1451): nur die Wurzel offen lassen. */
  collapseTree(): void {
    const root = this.state.root();
    this.state.open.set(new Set(root ? [root.path] : []));
  }

  /** findItemByPath (Z.651-663). */
  findItemByPath(path: string): TreeItem | null {
    const root = this.tree.rootItem();
    if (!root) return null;
    if (itemPath(root) === path) return root;
    let it = root;
    let guard = 0;
    while (guard++ < 80) {
      const kids = this.tree.childItems(it);
      const next = kids.find((k) => {
        const kp = itemPath(k);
        return path === kp || path.startsWith(kp + '/') || path.startsWith(kp + '@');
      });
      if (!next) return null;
      if (itemPath(next) === path) return next;
      it = next;
    }
    return null;
  }

  /** findChainByPath (Z.752-766): Kette Wurzel -> Ziel. */
  findChainByPath(path: string): TreeItem[] {
    const root = this.tree.rootItem();
    if (!root) return [];
    const chain: TreeItem[] = [root];
    if (itemPath(root) === path) return chain;
    let it = root;
    let guard = 0;
    while (guard++ < 100) {
      const kids = this.tree.childItems(it);
      const next = kids.find((k) => {
        const kp = itemPath(k);
        return path === kp || path.startsWith(kp + '/') || path.startsWith(kp + '@');
      });
      if (!next) return chain;
      chain.push(next);
      if (itemPath(next) === path) return chain;
      it = next;
    }
    return chain;
  }

  /** openAncestors (Z.767-770). */
  openAncestors(path: string): void {
    const chain = this.findChainByPath(path);
    const next = new Set(this.state.open());
    for (let i = 0; i < chain.length - 1; i++) next.add(itemPath(chain[i]!));
    this.state.open.set(next);
  }

  /** selectItem (Z.771-776): Item auswaehlen, Vorfahren oeffnen, hinscrollen. */
  selectItem(it: TreeItem): void {
    this.state.selItem.set(it);
    this.openAncestors(itemPath(it));
    this.state.requestScroll(itemPath(it));
  }

  /** Pfeiltasten-Navigation im Baum (Z.2443-2462). Gibt true zurueck, wenn navigiert wurde. */
  arrowNavigate(key: string): boolean {
    const sel = this.state.selItem();
    if (!this.state.root() || !sel) return false;
    const path = itemPath(sel);
    const chain = this.findChainByPath(path);
    if (key === 'ArrowLeft') {
      if (chain.length > 1) {
        this.selectItem(chain[chain.length - 2]!);
        return true;
      }
    } else if (key === 'ArrowRight') {
      const kids = this.tree.childItems(sel);
      if (kids.length) {
        this.state.setOpen(path, true);
        this.selectItem(kids[0]!);
        return true;
      }
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      if (chain.length > 1) {
        const sibs = this.tree.childItems(chain[chain.length - 2]!);
        const idx = sibs.findIndex((k) => itemPath(k) === path);
        const ni = idx + (key === 'ArrowDown' ? 1 : -1);
        if (idx >= 0 && ni >= 0 && ni < sibs.length) {
          this.selectItem(sibs[ni]!);
          return true;
        }
      }
    }
    return false;
  }

  /** openPathTo (Z.641-649): alle Vorfahren entlang eines Pfades oeffnen. */
  openPathTo(path: string): void {
    const segs = path.split('/');
    const next = new Set(this.state.open());
    let cur = '';
    for (const sg of segs) {
      cur = cur ? cur + '/' + sg : sg;
      const at = sg.indexOf('@');
      if (at >= 0) next.add(cur.slice(0, cur.length - (sg.length - at)));
      next.add(cur);
    }
    this.state.open.set(next);
  }

  /** jumpTo (Z.744-750): zum Ziel oeffnen, auswaehlen, hinscrollen. */
  jumpTo(path: string): void {
    this.openPathTo(path);
    const t = this.findItemByPath(path);
    if (t) this.state.selItem.set(t);
    this.state.requestScroll(path);
  }
}
