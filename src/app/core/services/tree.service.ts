import { Injectable, inject } from '@angular/core';
import { TreeItem, TreeNode } from '../../models/node.model';
import { Auspraegung, Erweiterung } from '../../models/profile.model';
import { XsdIndex } from '../../models/xsd-index.model';
import { datentypQuelleOf } from '../util/datentyp.util';
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
      id: ++this.nodeId,
      path: '',
      name: '',
      min: '1',
      max: '1',
      doc: '',
      typeName: null,
      xsdEl: null,
      model: null,
      children: null,
      parent: null,
      depth: 0,
      synthetic: false,
      recursive: false,
      codelist: null,
      typeStack: [],
      inChoice: false,
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
            c.namespaceURI === XS && ['element', 'choice', 'sequence', 'any'].includes(c.localName),
        ),
        n.model === 'choice',
      );
      return;
    }
    if (n.erweiterung) ct = this.erwCT(n.erweiterung);
    else if (n.xsdEl) {
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
            n.path +
            '/' +
            (p.localName === 'choice' ? '_auswahl' : '_gruppe') +
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
   * Der **Schema**-Typ einer Erweiterung (#97) — null, wenn die Erweiterung
   * einen Container meint, einen xs:-Basistyp traegt oder der Typ Freitext ist.
   * Nur ein aus dem Schema gewaehlter Typ wird aufgeloest: ein Freitext-Typ ist
   * ausdruecklich einer, den es (noch) nicht gibt.
   */
  private erwSchemaTyp(e: Erweiterung): string | null {
    return datentypQuelleOf(e) === 'schema' ? (e.datentyp ?? null) : null;
  }

  /** Der complexType hinter dem Schema-Typ einer Erweiterung; null, wenn keiner auflöst. */
  private erwCT(e: Erweiterung): Element | null {
    const t = this.erwSchemaTyp(e);
    return t ? (this.idx?.ct[t] ?? null) : null;
  }

  /**
   * Der Schema-Typ einer Erweiterung, den das **aktive** Schema nicht kennt —
   * sonst null. Realer Fall: `Type.GDS.GeheimhaltungType` gibt es in 3.6.2, in
   * 4.0.0 ist er entfallen. Der Knoten wird dann zum Blatt; das Profil bleibt
   * unangetastet, die Warnung macht den Defekt sichtbar.
   */
  erwTypFehlt(n: TreeNode): string | null {
    if (!n.erweiterung) return null;
    const t = this.erwSchemaTyp(n.erweiterung);
    if (!t || !this.idx) return null;
    return this.idx.ct[t] || this.idx.st[t] ? null : t;
  }

  /**
   * Synthetisiert die Erweiterungs-Knoten unter einem Elternknoten — frisch pro
   * Aufruf, bewusst ohne Lazy-Cache: der Bestand liegt reaktiv im StateService
   * und wuerde im `children`-Cache bei Add/Remove veralten.
   *
   * Traegt die Erweiterung einen Schema-Typ, wird der Knoten wie ein
   * Schemaknoten bestueckt (#97): Codelisten-Bindung, Typ-Stack und damit der
   * Rekursionsschutz greifen ueber die Erweiterungsgrenze hinweg. Die
   * Unterelemente entstehen erst in `expandNode` — **lebende Referenz**, keine
   * Kopie der Typstruktur ins Profil.
   */
  erweiterungsKinder(parent: TreeNode): TreeNode[] {
    const list = this.state.erweiterungenOf(parent.path);
    if (!list?.length) return [];
    return list.map((e) => {
      const typ = this.erwSchemaTyp(e);
      const n = this.makeNode({
        name: e.name,
        path: parent.path + '/~' + e.id,
        parent,
        depth: parent.depth + 1,
        min: e.min,
        max: e.max,
        doc: e.beschreibung ?? '',
        typeName: e.datentyp ?? null,
        erweiterung: e,
        typeStack: typ ? [...parent.typeStack, typ] : parent.typeStack,
      });
      if (typ && this.idx) {
        n.codelist = this.parser.codelistOf(typ, this.idx);
        if (parent.typeStack.includes(typ)) n.recursive = true;
      }
      return n;
    });
  }

  /**
   * Alle Kinder eines Knotens: Schema-Kinder plus angehaengte
   * Schema-Erweiterungen. Fuer Erweiterungsknoten gilt dieselbe Regel — ihre
   * Schema-Kinder kommen aus dem Typ, den sie tragen (#97).
   */
  kinder(n: TreeNode): TreeNode[] {
    this.expandNode(n);
    const erw = this.erweiterungsKinder(n);
    return erw.length ? [...(n.children ?? []), ...erw] : (n.children ?? []);
  }

  /** isLeaf (Z.527-541). */
  isLeaf(n: TreeNode): boolean {
    if (n.erweiterung) {
      // Blatt, wenn der Typ zu keiner Struktur aufloest UND keine eigenen
      // Erweiterungen hängen. Ein Container (ohne Typ) bleibt aufklappbar —
      // darunter liegt die "+ Element"-Box.
      if (this.state.erweiterungenOf(n.path)?.length) return false;
      if (n.codelist) return true;
      if (!n.erweiterung.datentyp) return false;
      const ct = this.erwCT(n.erweiterung);
      if (!ct) return true;
      const cm = this.parser.particlesOfCT(ct, this.i);
      return cm.simple || cm.parts.length === 0;
    }
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

  /**
   * **Die Ersetzungsregel des gerenderten Baums** — an genau einer Stelle:
   * traegt ein Element benannte Vorkommen (`auspsOf`), ersetzen deren
   * Kontext-Knoten (`ctxNode`) die generischen Kinder. null, wo die Regel
   * nicht greift (keine Vorkommen) — dann gilt der generische Abstieg.
   *
   * Vor diesem Modul war die Regel neunfach nachgebaut; ein Walk, der sie
   * nicht kannte, materialisierte am generischen Pfad vorbei am gerenderten
   * Baum (Bug #28 Teil 1). Alle Absteiger — childItems, walkFull, emit,
   * Excel-Zeilen, der gefuehrte Struktur-Walk, walkProfil — sind Konsumenten.
   * Bewusst NICHT darauf umgestellt: instance-import/-export — die betreiben
   * Rekonziliation (sie erzeugen bzw. gleichen Vorkommen gegen das XML ab),
   * die Umkehrung dieser Regel, keine Kopie.
   */
  vorkommenKinder(n: TreeNode): { node: TreeNode; ausp: Auspraegung }[] | null {
    const ausps = this.state.auspsOf(n.path);
    if (!ausps || !ausps.length) return null;
    return ausps.map((a) => ({ node: this.ctxNode(n, a.id), ausp: a }));
  }

  /**
   * Abstiegsziele eines Knotens im gerenderten Baum: je benanntem Vorkommen
   * sein Kontext-Knoten, sonst die Kinder (Schema plus Erweiterungen);
   * leer bei Rekursion. `ausp` ist genau an den Vorkommen-Schritten gesetzt.
   */
  abstiegsKinder(n: TreeNode): { node: TreeNode; ausp?: Auspraegung }[] {
    // Rekursion **vor** der Ersetzungsregel (Deep-Review-Befund): alle Walker
    // stoppten schon immer an rekursiven Elementen, auch wenn diese Vorkommen
    // tragen — sonst liefe der Abstieg ueber ctxNode (das nie `recursive`
    // traegt) bis zur Tiefenkappe und legte dabei persistente Zustaende an
    // (Materialisierung, Vorbelegung). Die *Darstellung* (childItems) zeigt
    // die Vorkommen eines rekursiven Elements weiterhin — diese Asymmetrie
    // ist alt und bleibt bewusst bestehen.
    if (n.recursive) return [];
    const vorkommen = this.vorkommenKinder(n);
    if (vorkommen) return vorkommen;
    return this.kinder(n).map((node) => ({ node }));
  }

  /**
   * Profilbewusster Baum-Abstieg fuer Walker ohne eigene Flusskontrolle:
   * besucht ab `start` (exklusiv) jeden Schritt des gerenderten Baums —
   * Vorkommen-Ersetzung, Rekursionswaechter und Tiefenkappe liegen hier,
   * nicht beim Aufrufer. `besuch` entscheidet je Schritt ueber den Abstieg;
   * Mutationen im Besuch (etwa `addAusp`) wirken auf den anschliessenden
   * Abstieg, weil die Abstiegsziele erst dann bestimmt werden.
   */
  walkProfil(
    start: TreeNode,
    besuch: (schritt: { node: TreeNode; ausp?: Auspraegung }, tiefe: number) => boolean,
    maxTiefe = 25,
  ): void {
    const rec = (n: TreeNode, tiefe: number): void => {
      if (tiefe > maxTiefe) return;
      for (const schritt of this.abstiegsKinder(n)) {
        // Ein Vorkommen-Schritt verbraucht keine Tiefe: die Alt-Walker sprangen
        // mit derselben Tiefe in den Kontext-Knoten — Kinder eines Vorkommens
        // liegen so tief wie generische Kinder (Deep-Review-Befund).
        if (besuch(schritt, tiefe)) rec(schritt.node, schritt.ausp ? tiefe : tiefe + 1);
      }
    };
    rec(start, 0);
  }

  /** childItems (Z.1041-1055): sichtbare Kind-Items (Ausprägungen oder Element-Kinder). */
  childItems(it: TreeItem): TreeItem[] {
    if (it.kind === 'el') {
      const n = it.node;
      const vorkommen = this.vorkommenKinder(n);
      if (vorkommen)
        return vorkommen.map(({ ausp }) => ({
          kind: 'ausp',
          parentNode: n,
          ausp,
          path: n.path + '@' + ausp.id,
        }));
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
  flattenSchema(
    msgName: string,
    idx: XsdIndex,
  ): Map<string, { kard: string; typ: string; cl: string }> | null {
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
   * Pflicht-Rueckgrats unterhalb eines beliebigen Teilbaum-Ankers — fuer die
   * Zwingend-Vorbelegung (beim Anlegen einer Profilierung ist der Anker die
   * Wurzel; Kaskade/Reparatur setzen mitten im Baum an, auch auf Auswahl-
   * Zweigen und Auspraegungs-Kontextknoten aus `ctxNode`, Pfadraum `…@auspId/…`).
   * Ein Element zaehlt nur, wenn es selbst `min>=1` ist UND alle Vorfahren bis
   * zum Anker ebenfalls unbedingt Pflicht sind (keine optionalen Zwischeneltern,
   * keine choice-Alternativen). Der Walk steigt daher nur in den Pflicht-Ast ab
   * (kein Voll-Expandieren des Baums) und nutzt dieselben Schutzgrenzen wie
   * `flattenSchema` (Tiefe, Rekursion). Der Anker selbst wird ausgelassen —
   * seine eigene Kardinalitaet/Disposition spielt keine Rolle.
   */
  collectMandatoryPaths(anker: TreeNode): string[] {
    const out: string[] = [];
    this.walkProfil(anker, ({ node: c, ausp }) => {
      // Vorkommen-Schritt: das Rueckgrat liegt je Kontext an den @-Pfaden —
      // dort, wo der Baum rendert. Vorher lief der Walk nur ueber die
      // generischen Kinder, und die Vorbelegung landete an Pfaden, die bei
      // benannten Vorkommen niemand rendert.
      if (ausp) return true;
      // Wie bisher: nur Schema-Kinder, keine Erweiterungen.
      if (c.erweiterung) return false;
      if (c.synthetic) {
        // Gruppen selbst nicht markieren. Eine choice bricht das Rueckgrat
        // (Alternativen sind frei — auch Gruppen-Alternativen einer Auswahl),
        // eine optionale Gruppe (min=0) ebenso.
        return !(c.model === 'choice' || c.min === '0' || c.inChoice);
      }
      // Nur unbedingte Pflichtelemente: min>=1 und nicht in einer Auswahl.
      if (c.min === '0' || c.inChoice) return false;
      out.push(c.path);
      return true;
    });
    return out;
  }

  /**
   * Verlangt der Container selbst eine Auswahl? `collectMandatoryPaths` bricht
   * an jeder `choice` ab — zu Recht, denn keine Alternative ist fuer sich
   * unbedingt, und die Zwingend-Vorbelegung darf keinen Zweig vorwegnehmen.
   * Fuer die Mangel-Frage aus #71 ist das aber die falsche Antwort: die Auswahl
   * erzwingt sehr wohl etwas — genau ein Zweig muss belegt werden, nur welcher
   * ist Sache des Durchlaufs (XJustiz 3.6.2 fuehrt 145 `auswahl_*`-Container).
   *
   * Geprueft werden die beiden Formen, in denen eine Auswahl unmittelbar unter
   * dem Container steht: sein eigenes Inhaltsmodell ist die `choice`, oder eine
   * unbedingte `choice`-Gruppe liegt als synthetisches Kind darunter. Tiefer
   * zu suchen ist unnoetig — eine Auswahl unterhalb eines Pflicht-Kindes
   * bedeutet ein Pflicht-Rueckgrat, und dann stellt sich die Frage nicht mehr.
   */
  verlangtAuswahl(anker: TreeNode): boolean {
    return this.auswahlZweige(anker).some((zweige) => zweige.length > 0);
  }

  /**
   * Die Alternativen je Auswahl, die unmittelbar unter dem Container zu treffen
   * ist — eine Liste je Auswahl, weil eine Sequenz mehrere `choice`-Gruppen
   * enthalten kann. Grundlage von `verlangtAuswahl` und der Frage, ob eine
   * Profilierung der Auswahl noch einen Zweig laesst.
   */
  auswahlZweige(anker: TreeNode): TreeNode[][] {
    const kinder = this.kinder(anker);
    if (!kinder.length) return [];
    if (anker.model === 'choice') return [kinder];
    return kinder
      .filter((c) => c.synthetic && c.model === 'choice' && c.min !== '0' && !c.inChoice)
      .map((gruppe) => this.kinder(gruppe));
  }

  /** itemHasKids (Z.1056-1065). */
  itemHasKids(it: TreeItem): boolean {
    if (it.kind === 'el') {
      const n = it.node;
      // Erweiterungsknoten folgen derselben Regel wie Schemaknoten (#97):
      // Container sind immer aufklappbar (darunter liegt die "+ Element"-Box),
      // ein typisierter Knoten genau dann, wenn sein Typ zu einer Struktur
      // aufloest — `isLeaf` entscheidet beides.
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
