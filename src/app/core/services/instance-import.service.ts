import { Injectable, inject } from '@angular/core';
import { TreeNode } from '../../models/node.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';

/**
 * Importiert eine bestehende XJustiz-Nachricht (XML-Instanz) und bildet sie
 * gegen das geladene Schema zurück ins Profil-Modell ab — die Umkehrung von
 * `ExportService.genBeispielXml`. Ergebnis: der Baum sieht aus wie eine von
 * Hand gebaute Testnachricht (Blatt-Testwerte, Codelisten-Werte, Ausprägungen
 * für mehrfach vorkommende Elemente).
 *
 * Regeln (mit dem Nutzer abgestimmt):
 * - Das passende XSD muss geladen sein (Root-Element bestimmt die `nachricht.*`).
 * - Genau 1 Vorkommen eines wiederholbaren Elements → Werte direkt gefüllt.
 * - Ab 2 Vorkommen → je eine Auspraegung „Vorkommen N".
 * - Kein Status wird gesetzt; nur Testwerte und Ausprägungen.
 */
@Injectable({ providedIn: 'root' })
export class InstanceImportService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);

  /** Prüft, ob ein XML-Text eine XJustiz-Nachricht (kein Genericode o. ä.) ist. */
  static rootMessageName(xmlText: string): string | null {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    const name = doc.documentElement?.localName ?? '';
    return /^nachricht\./.test(name) ? name : null;
  }

  /** Importiert die XML-Instanz und lädt sie als aktuelles Profil. */
  importXml(xmlText: string): void {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML nicht lesbar (Parserfehler).');
    const rootEl = doc.documentElement;
    if (!rootEl) throw new Error('Leeres XML.');
    const msgName = rootEl.localName;
    const idx = this.state.idx();
    if (!idx) throw new Error('Bitte zuerst den passenden XSD-Ordner laden.');
    if (!idx.el[msgName]) throw new Error(`Kein passendes Schema für <${msgName}> geladen.`);

    this.nav.loadMessage(msgName); // setzt Profil zurück, baut den Baum
    const root = this.state.root()!;
    const opened = new Set<string>([root.path]);
    this.bindChildren(root, rootEl, opened, 0);
    this.state.open.set(opened);
    this.state.selItem.set({ kind: 'el', node: root });
    this.toast.show(`Nachricht ${msgName} geladen.`);
  }

  private byName(el: Element, name: string): Element[] {
    return Array.from(el.children).filter((c) => c.localName === name);
  }

  /** Bindet die Schema-Kinder von `node` an die XML-Kinder von `xmlEl`. */
  private bindChildren(node: TreeNode, xmlEl: Element, opened: Set<string>, depth: number): void {
    if (depth > 40) return;
    this.tree.expandNode(node);
    const done = new Set<string>();
    for (const child of node.children ?? []) {
      if (child.synthetic) {
        // choice/sequence-Gruppe: ihre Element-Kinder liegen direkt unter xmlEl
        opened.add(child.path);
        this.bindChildren(child, xmlEl, opened, depth + 1);
        continue;
      }
      if (done.has(child.name)) continue; // gleicher Basisname nur einmal
      done.add(child.name);
      const matches = this.byName(xmlEl, child.name);
      if (!matches.length) continue;
      this.bindElement(child, matches, opened, depth);
    }
  }

  private bindElement(child: TreeNode, matches: Element[], opened: Set<string>, depth: number): void {
    if (matches.length >= 2 && this.tree.isRepeatable(child)) {
      opened.add(child.path);
      matches.forEach((m, i) => {
        const auspId = this.state.addAusp(child.path, 'Vorkommen ' + (i + 1));
        const cn = this.tree.ctxNode(child, auspId);
        opened.add(cn.path);
        this.bindNode(cn, m, opened, depth + 1);
      });
    } else {
      // genau 1 Vorkommen (oder ungültig mehrfach bei nicht-wiederholbar → erstes)
      this.bindNode(child, matches[0]!, opened, depth);
    }
  }

  private bindNode(node: TreeNode, xmlEl: Element, opened: Set<string>, depth: number): void {
    if (node.recursive) return;
    if (this.tree.isLeaf(node)) {
      const val = this.leafValue(node, xmlEl);
      if (val) this.state.setElementProfile(node.path, { beispiel: val });
      return;
    }
    opened.add(node.path);
    this.bindChildren(node, xmlEl, opened, depth + 1);
  }

  private leafValue(node: TreeNode, xmlEl: Element): string {
    if (node.codelist) {
      const code = this.byName(xmlEl, 'code')[0];
      return ((code ? code.textContent : xmlEl.textContent) ?? '').trim();
    }
    return (xmlEl.textContent ?? '').trim();
  }
}
