import { Injectable, inject } from '@angular/core';
import { TreeItem, TreeNode } from '../../models/node.model';
import { XsdIndex } from '../../models/xsd-index.model';
import { docOf, kid, local } from '../util/xml.util';
import { XS } from '../util/xml.util';
import { fmtKard } from '../util/pretty.util';
import { XsdParserService } from './xsd-parser.service';
import { StateService } from './state.service';

/**
 * Baum-Modell: Aufbau und Lazy-Expansion der Element-Knoten. Portiert aus
 * Profilierer.html (Funktionsgruppe B, Z.459-556 + 1039-1065).
 *
 * `expandNode` mutiert `node.children` (Lazy-Cache-Baum) — das ist bewusst kein
 * reaktiver Zustand. Reaktiv sind nur Auswahl, Oeffnungszustaende und Profil
 * (im StateService). `nodeId`/`ctxCache`/`idx` sind Instanzfelder (frueher
 * globale Mutables NODEID/S.ctxCache/S.idx, Z.459/468/329).
 */
@Injectable({ providedIn: 'root' })
export class TreeService {
  private readonly parser = inject(XsdParserService);
  private readonly state = inject(StateService);

  private nodeId = 0;
  private ctxCache: Record<string, TreeNode> = {};
  private idx: XsdIndex | null = null;

  private get i(): XsdIndex {
    if (!this.idx) throw new Error('TreeService: kein aktiver Schema-Index (buildRoot fehlt).');
    return this.idx;
  }

  /** makeNode (Z.460-466): Knoten mit Defaults. */
  private makeNode(o: Partial<TreeNode>): TreeNode {
    return {
      id: ++this.nodeId, path: '', name: '', min: '1', max: '1', doc: '', typeName: null,
      xsdEl: null, model: null, children: null, parent: null, depth: 0,
      synthetic: false, recursive: false, codelist: null, typeStack: [], inChoice: false,
      ...o,
    };
  }

  /** buildRoot (Z.467-473): Wurzelknoten einer Nachricht; setzt den aktiven Index. */
  buildRoot(msgName: string, idx: XsdIndex): TreeNode {
    this.nodeId = 0;
    this.ctxCache = {};
    this.idx = idx;
    const el = idx.el[msgName] ?? null;
    return this.makeNode({
      name: msgName,
      path: msgName,
      xsdEl: el,
      doc: docOf(el),
      depth: 0,
      typeName: el ? local(el.getAttribute('type')) : null,
    });
  }

  /** expandNode (Z.474-492): fuellt `children` lazy. */
  expandNode(n: TreeNode): void {
    if (n.children !== null) return;
    n.children = [];
    if (n.codelist) return;
    let ct: Element | null = null;
    if (n.synthetic && n.groupEl) {
      this.addParts(
        n,
        Array.from(n.groupEl.children).filter(
          (c) =>
            c.namespaceURI === XS &&
            ['element', 'choice', 'sequence', 'any'].includes(c.localName),
        ),
        n.model === 'choice',
      );
      return;
    }
    if (n.xsdEl) {
      ct = kid(n.xsdEl, 'complexType');
      if (!ct && n.typeName && this.i.ct[n.typeName]) ct = this.i.ct[n.typeName]!;
    }
    if (!ct) return;
    const cm = this.parser.particlesOfCT(ct, this.i);
    if (cm.simple) return;
    n.model = cm.model;
    this.addParts(n, cm.parts, cm.model === 'choice');
  }

  /** addParts (Z.493-526): erzeugt Kind-Knoten aus Partikeln. */
  private addParts(n: TreeNode, parts: Element[], parentIsChoice: boolean): void {
    const nameCount: Record<string, number> = {};
    for (const p of parts) {
      if (p.localName === 'element') {
        const name = p.getAttribute('name') || local(p.getAttribute('ref')) || '';
        const dup = (nameCount[name] = (nameCount[name] || 0) + 1) - 1;
        const seg = dup > 0 ? name + '#' + dup : name;
        let el = p;
        const refName = local(p.getAttribute('ref'));
        if (p.getAttribute('ref') && refName && this.i.el[refName]) el = this.i.el[refName]!;
        const tName = local(el.getAttribute('type'));
        const child = this.makeNode({
          name,
          path: n.path + '/' + seg,
          xsdEl: el,
          parent: n,
          depth: n.depth + 1,
          min: p.getAttribute('minOccurs') || '1',
          max: p.getAttribute('maxOccurs') || '1',
          doc: docOf(p) || docOf(el),
          typeName: tName,
          inChoice: !!parentIsChoice,
          typeStack: tName ? [...n.typeStack, tName] : n.typeStack,
        });
        if (tName) {
          child.codelist = this.parser.codelistOf(tName, this.i);
          if (n.typeStack.includes(tName)) child.recursive = true;
        }
        n.children!.push(child);
      } else if (p.localName === 'choice' || p.localName === 'sequence') {
        const label = p.localName === 'choice' ? '(Auswahl)' : '(Gruppe)';
        const dup = (nameCount[label] = (nameCount[label] || 0) + 1) - 1;
        const child = this.makeNode({
          name: label,
          synthetic: true,
          groupEl: p,
          parent: n,
          depth: n.depth + 1,
          path:
            n.path + '/' + (p.localName === 'choice' ? '_auswahl' : '_gruppe') +
            (dup > 0 ? '#' + dup : ''),
          min: p.getAttribute('minOccurs') || '1',
          max: p.getAttribute('maxOccurs') || '1',
          model: p.localName,
          typeStack: n.typeStack,
          inChoice: !!parentIsChoice,
        });
        n.children!.push(child);
      }
    }
  }

  /**
   * Synthetisiert die Erweiterungs-Knoten unter einem Elternknoten — frisch pro
   * Aufruf, bewusst ohne Lazy-Cache: der Bestand liegt reaktiv im StateService
   * und wuerde im `children`-Cache bei Add/Remove veralten.
   */
  erweiterungsKinder(parent: TreeNode): TreeNode[] {
    const list = this.state.erweiterungenOf(parent.path);
    if (!list?.length) return [];
    return list.map((e) =>
      this.makeNode({
        name: e.name,
        path: parent.path + '/~' + e.id,
        parent,
        depth: parent.depth + 1,
        min: e.min,
        max: e.max,
        doc: e.beschreibung ?? '',
        typeName: e.datentyp ?? null,
        erweiterung: e,
      }),
    );
  }

  /** Alle Kinder eines Knotens: Schema-Kinder plus angehaengte Schema-Erweiterungen. */
  kinder(n: TreeNode): TreeNode[] {
    if (n.erweiterung) return this.erweiterungsKinder(n);
    this.expandNode(n);
    const erw = this.erweiterungsKinder(n);
    return erw.length ? [...(n.children ?? []), ...erw] : (n.children ?? []);
  }

  /** isLeaf (Z.527-541). */
  isLeaf(n: TreeNode): boolean {
    if (n.erweiterung)
      return !!n.erweiterung.datentyp && !this.state.erweiterungenOf(n.path)?.length;
    if (n.codelist) return true;
    if (n.children !== null) return n.children.length === 0;
    if (n.synthetic) return false;
    if (n.xsdEl) {
      if (kid(n.xsdEl, 'complexType')) return false;
      const t = n.typeName;
      if (t && this.i.ct[t]) {
        const cm = this.parser.particlesOfCT(this.i.ct[t]!, this.i);
        return cm.simple || cm.parts.length === 0;
      }
      return true;
    }
    return true;
  }

  /** isRepeatable (Z.542). */
  isRepeatable(n: TreeNode): boolean {
    return n.max === 'unbounded' || parseInt(n.max) > 1;
  }

  /** ctxNode (Z.544-554): Kontext-Knoten fuer eine Auspraegung (eigener Pfad-Raum). */
  ctxNode(parentNode: TreeNode, auspId: string): TreeNode {
    const key = parentNode.path + '@' + auspId;
    const cached = this.ctxCache[key];
    if (cached) return cached;
    const c = this.makeNode({
      name: parentNode.name,
      path: key,
      xsdEl: parentNode.xsdEl,
      typeName: parentNode.typeName,
      doc: parentNode.doc,
      min: '1',
      max: '1',
      depth: parentNode.depth,
      parent: parentNode.parent,
      codelist: parentNode.codelist,
      typeStack: parentNode.typeStack,
      model: null,
    });
    this.ctxCache[key] = c;
    return c;
  }

  /** rootItem (Z.1040). */
  rootItem(): TreeItem | null {
    const root = this.state.root();
    return root ? { kind: 'el', node: root } : null;
  }

  /** childItems (Z.1041-1055): sichtbare Kind-Items (Ausprägungen oder Element-Kinder). */
  childItems(it: TreeItem): TreeItem[] {
    if (it.kind === 'el') {
      const n = it.node;
      const ausps = this.state.auspsOf(n.path);
      if (ausps && ausps.length)
        return ausps.map((a) => ({ kind: 'ausp', parentNode: n, ausp: a, path: n.path + '@' + a.id }));
      if (n.recursive) return [];
      return this.kinder(n).map((c) => ({ kind: 'el', node: c }));
    }
    const cn = this.ctxNode(it.parentNode, it.ausp.id);
    if (cn.recursive) return [];
    return this.kinder(cn).map((c) => ({ kind: 'el', node: c }));
  }

  /**
   * flattenSchema (Z.2164-2185): flache Map aller Nicht-Gruppen-Elemente einer
   * Nachricht gegen einen bestimmten Index — fuer den Versionsvergleich. Baut
   * einen eigenen Wegwerf-Baum und stellt den aktiven Index danach wieder her.
   */
  flattenSchema(msgName: string, idx: XsdIndex): Map<string, { kard: string; typ: string; cl: string }> | null {
    const prevIdx = this.idx;
    const prevNodeId = this.nodeId;
    const prevCtx = this.ctxCache;
    this.idx = idx;
    this.ctxCache = {};
    try {
      const el = idx.el[msgName];
      if (!el) return null;
      const root = this.makeNode({
        name: msgName,
        path: msgName,
        xsdEl: el,
        typeName: local(el.getAttribute('type')),
      });
      const map = new Map<string, { kard: string; typ: string; cl: string }>();
      const rec = (n: TreeNode, depth: number): void => {
        if (depth > 25 || n.recursive) return;
        if (!this.isLeaf(n)) {
          this.expandNode(n);
          for (const c of n.children ?? []) {
            if (!c.synthetic)
              map.set(c.path.slice(msgName.length), {
                kard: fmtKard(c.min, c.max),
                typ: c.typeName || '',
                cl: c.codelist ? c.codelist.kennung || c.codelist.typeName : '',
              });
            rec(c, depth + 1);
          }
        }
      };
      rec(root, 0);
      return map;
    } finally {
      this.idx = prevIdx;
      this.nodeId = prevNodeId;
      this.ctxCache = prevCtx;
    }
  }

  /**
   * Sammelt die Pfade aller *unbedingten* Pflichtelemente entlang des
   * Pflicht-Rueckgrats — fuer die Zwingend-Vorbelegung beim Anlegen einer
   * Profilierung. Ein Element zaehlt nur, wenn es selbst `min>=1` ist UND alle
   * Vorfahren ebenfalls unbedingt Pflicht sind (keine optionalen Zwischeneltern,
   * keine choice-Alternativen). Der Walk steigt daher nur in den Pflicht-Ast ab
   * (kein Voll-Expandieren des Baums) und nutzt dieselben Schutzgrenzen wie
   * `flattenSchema` (Tiefe, Rekursion). Der Wurzelknoten selbst wird ausgelassen.
   */
  collectMandatoryPaths(root: TreeNode): string[] {
    const out: string[] = [];
    const rec = (n: TreeNode, depth: number): void => {
      if (depth > 25) return;
      this.expandNode(n);
      for (const c of n.children ?? []) {
        if (c.synthetic) {
          // Gruppen selbst nicht markieren. Eine choice bricht das Rueckgrat
          // (Alternativen sind frei), eine optionale Gruppe (min=0) ebenso.
          if (c.model === 'choice' || c.min === '0') continue;
          rec(c, depth + 1);
          continue;
        }
        // Nur unbedingte Pflichtelemente: min>=1 und nicht in einer Auswahl.
        if (c.min === '0' || c.inChoice) continue;
        out.push(c.path);
        if (!c.recursive) rec(c, depth + 1);
      }
    };
    rec(root, 0);
    return out;
  }

  /** itemHasKids (Z.1056-1065). */
  itemHasKids(it: TreeItem): boolean {
    if (it.kind === 'el') {
      const n = it.node;
      // Container-Erweiterungen sind immer aufklappbar (darunter liegt die
      // "+ Element"-Box — der einzige Weg, dort ein Kind anzulegen).
      if (n.erweiterung)
        return !n.erweiterung.datentyp || !!this.state.erweiterungenOf(n.path)?.length;
      const ausps = this.state.auspsOf(n.path);
      if (ausps && ausps.length) return true;
      if (this.state.erweiterungenOf(n.path)?.length) return true;
      return !n.recursive && !this.isLeaf(n);
    }
    const cn = this.ctxNode(it.parentNode, it.ausp.id);
    if (this.state.erweiterungenOf(cn.path)?.length) return true;
    return !cn.recursive && !this.isLeaf(cn);
  }
}
