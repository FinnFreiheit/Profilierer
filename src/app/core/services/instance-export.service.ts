import { Injectable, inject } from '@angular/core';
import { TreeNode } from '../../models/node.model';
import { Auspraegung } from '../../models/profile.model';
import { MessageEditSession } from '../../models/testmessage.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { ValueService } from './value.service';
import { byName, esc, leafValue } from '../util/xml.util';

/** Durchgereichter Einfüge-Cursor: das zuletzt in Schema-Reihenfolge platzierte
 *  Element unter einem Eltern-Knoten (Anker für neu eingefügte Elemente). */
interface Cursor {
  last: Node | null;
}

/**
 * Serialisiert die aktuell bearbeitete XJustiz-Instanz wieder zu XML — **getreu**:
 * Basis ist das geklonte Quell-DOM der Original-Nachricht (aus der
 * `MessageEditSession`), in das nur die im Modell tatsächlich geänderten Werte
 * und Strukturen eingepflegt werden. Unangetastete Teile (Attribute, Reihenfolge,
 * nicht editierte Elemente) bleiben damit 1:1 erhalten — die Umkehrung des
 * `InstanceImportService`, aber ohne dessen Verlust.
 *
 * Der Patch-Walk (`patchChildren`/`patchElement`/`patchNode`) spiegelt exakt den
 * Bind-Walk des Imports, sodass Modell-Pfade und DOM-Elemente deckungsgleich
 * zugeordnet werden. Beim Speichern als *neue* Nachricht werden Nachrichten-ID
 * und Erstellungszeitpunkt im Nachrichtenkopf frisch gesetzt.
 */
@Injectable({ providedIn: 'root' })
export class InstanceExportService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly values = inject(ValueService);

  /** Ziel-Dokument (Klon der Quelle) sowie Präfix/Namespace für neue Elemente. */
  private outDoc!: Document;
  private ns = '';
  private prefix: string | null = null;
  /** Ausprägungs-Pfad → Index des Quell-Vorkommens (stabile Zuordnung). */
  private vorkommenIndex: ReadonlyMap<string, number> = new Map();
  /**
   * In diesem Lauf neu erzeugte Elemente. Nur Angaben, die aus der Quelle
   * stammen, dürfen durch einen geleerten Modellwert entfallen — erzeugte
   * tragen typkonforme Platzhalter statt Modellwerte und blieben sonst nie
   * bestehen.
   */
  private erzeugt = new WeakSet<Element>();

  /**
   * Erzeugt das getreue Instanz-XML der laufenden Bearbeitungs-Session.
   * `neueKopfdaten` (Default an) vergibt eine neue `eigeneNachrichtenID` und
   * setzt den `erstellungszeitpunkt` auf jetzt — passend für „als neue Nachricht".
   */
  buildInstanceXml(session: MessageEditSession, neueKopfdaten = true): string {
    const root = this.state.root();
    if (!root) throw new Error('Keine Nachricht geladen.');
    const out = session.sourceDoc.cloneNode(true) as Document;
    this.outDoc = out;
    const outRoot = out.documentElement;
    this.ns = outRoot.namespaceURI ?? '';
    this.prefix = outRoot.prefix ?? null;
    this.vorkommenIndex = session.vorkommenIndex;
    this.erzeugt = new WeakSet<Element>();

    this.patchChildren(root, outRoot, 0);
    if (neueKopfdaten) this.refreshKopf(outRoot);
    return this.serializePretty(out);
  }

  // ── Patch-Walk (spiegelt InstanceImportService) ─────────────────────

  /** Bindet die Schema-Kinder von `node` an die DOM-Kinder von `xmlEl`. */
  private patchChildren(node: TreeNode, xmlEl: Element, depth: number): void {
    if (depth > 40) return;
    this.tree.expandNode(node);
    const cursor: Cursor = { last: null };
    const done = new Set<string>();
    for (const child of node.children ?? []) {
      if (child.synthetic) {
        // choice/sequence-Gruppe: ihre Element-Kinder liegen direkt unter xmlEl.
        this.patchGroup(child, xmlEl, cursor, depth + 1);
        continue;
      }
      if (done.has(child.name)) continue; // gleicher Basisname nur einmal
      done.add(child.name);
      this.patchElement(child, xmlEl, cursor, depth);
    }
  }

  /** Synthetische Gruppe: teilt den Cursor des Elternknotens (gleiche DOM-Ebene). */
  private patchGroup(group: TreeNode, xmlEl: Element, cursor: Cursor, depth: number): void {
    if (depth > 40) return;
    this.tree.expandNode(group);
    const done = new Set<string>();
    for (const child of group.children ?? []) {
      if (child.synthetic) {
        this.patchGroup(child, xmlEl, cursor, depth + 1);
        continue;
      }
      if (done.has(child.name)) continue;
      done.add(child.name);
      this.patchElement(child, xmlEl, cursor, depth);
    }
  }

  private patchElement(child: TreeNode, parentXmlEl: Element, cursor: Cursor, depth: number): void {
    const matches = byName(parentXmlEl, child.name);

    // Ausgeschlossen (direkt oder geerbt) → alle Vorkommen entfernen.
    if (this.state.wirkungOf(child.path) === 'ausgeschlossen') {
      matches.forEach((m) => m.remove());
      return;
    }

    const ausps = this.state.auspsOf(child.path);
    if (ausps && ausps.length) {
      const placed = this.reconcileAusps(child, ausps, parentXmlEl, matches, cursor, depth);
      if (placed.length) cursor.last = placed[placed.length - 1]!;
      return;
    }

    if (matches.length) {
      // 0/1 Vorkommen: erstes patchen, evtl. überzählige (ungültig mehrfach) belassen.
      this.patchNode(child, matches[0]!, depth);
      // Nur als Anker taugt, was noch im Dokument haengt — ein per patchLeaf
      // entferntes Blatt wuerde insertAfter sonst an den Anfang setzen.
      const letzte = matches[matches.length - 1]!;
      if (letzte.parentNode) cursor.last = letzte;
      return;
    }

    // Kein Vorkommen im Original: nur einfügen, wenn im Modell aktiv belegt.
    if (this.hasModelContent(child.path)) {
      const el = this.generate(child, depth);
      this.insertAfter(parentXmlEl, cursor.last, el);
      cursor.last = el;
    }
  }

  /**
   * Gleicht die DOM-Vorkommen eines wiederholbaren Elements an die Modell-
   * Ausprägungen an. Die Zuordnung läuft über den `vorkommenIndex` der
   * Bearbeitungs-Session (Ausprägung → Index des Quell-Vorkommens), nicht über
   * die Position in der Ausprägungsliste: sonst erbte nach dem Löschen des
   * ersten Vorkommens das nachrückende dessen unveränderte Werte.
   *
   * Ausprägungen ohne Quell-Vorkommen werden **erzeugt** statt geklont — ein
   * Klon des ersten würde stillschweigend dessen Werte (inkl. IDs) doppeln.
   * Einzige Ausnahme: das Duplizieren eines bislang einzelnen Vorkommens; dort
   * erbt „Fall 1" das Original, weil `duplicateElement` genau dessen Werte
   * dorthin verschoben hat. Überzählige DOM-Vorkommen entfallen; anschließend
   * wird in Modell-Reihenfolge an der ursprünglichen Stelle eingesetzt.
   */
  private reconcileAusps(
    child: TreeNode,
    ausps: Auspraegung[],
    parentXmlEl: Element,
    matches: Element[],
    cursor: Cursor,
    depth: number,
  ): Element[] {
    // Einfügeposition merken, bevor die alten Vorkommen gelöst werden.
    const anchor: Node | null = matches.length ? matches[matches.length - 1]!.nextSibling : null;
    matches.forEach((m) => m.remove());

    const idxOf = (a: Auspraegung): number | undefined =>
      this.vorkommenIndex.get(child.path + '@' + a.id);
    const ausImport = ausps.some((a) => idxOf(a) != null);

    const placed: Element[] = [];
    ausps.forEach((a, i) => {
      const k = idxOf(a);
      let occ: Element | null = k != null ? (matches[k] ?? null) : null;
      if (!occ && !ausImport && i === 0) occ = matches[0] ?? null;
      if (!occ) occ = this.generate(child, depth);
      const cn = this.tree.ctxNode(child, a.id);
      this.patchNode(cn, occ, depth + 1);
      placed.push(occ);
    });

    // Wieder einsetzen: an gemerkter Stelle, sonst am Cursor bzw. am Ende.
    let ref = anchor;
    if (!ref && cursor.last) ref = cursor.last.nextSibling;
    for (const occ of placed) parentXmlEl.insertBefore(occ, ref);
    return placed;
  }

  private patchNode(node: TreeNode, xmlEl: Element, depth: number): void {
    if (node.recursive) return;
    if (this.tree.isLeaf(node)) {
      this.patchLeaf(node, xmlEl);
      return;
    }
    this.patchChildren(node, xmlEl, depth + 1);
  }

  /**
   * Setzt den Blattwert nur, wenn er im Modell gegenüber dem Original geändert
   * wurde. Ein im Modell **geleerter** Wert entfernt die Angabe aus der
   * Nachricht — allerdings nur bei Blättern aus der Quelle: frisch erzeugte
   * tragen typkonforme Platzhalter ohne Modellwert und würden sonst sofort
   * wieder verschwinden.
   */
  private patchLeaf(node: TreeNode, xmlEl: Element): void {
    const val = this.state.elemente()[node.path]?.beispiel;
    const alt = leafValue(xmlEl, !!node.codelist);
    if (val == null) {
      if (alt && xmlEl.parentNode && !this.erzeugt.has(xmlEl)) xmlEl.remove();
      return;
    }
    if (val === alt) return; // unverändert → Treue wahren
    this.setLeafValue(node, xmlEl, val);
  }

  // ── DOM-Werte lesen/schreiben ───────────────────────────────────────

  private setLeafValue(node: TreeNode, xmlEl: Element, val: string): void {
    if (node.codelist) {
      let code = byName(xmlEl, 'code')[0];
      if (!code) {
        code = this.createCodeEl();
        xmlEl.insertBefore(code, xmlEl.firstChild);
      }
      code.textContent = val;
      // Klartext-Geschwister gehört zum alten Code → entfernen (kein neuer bekannt).
      byName(xmlEl, 'name').forEach((n) => n.remove());
    } else {
      xmlEl.textContent = val;
    }
  }

  // ── Neu-Erzeugung (Element fehlte im Original, ist im Modell belegt) ──

  /** Erzeugt ein DOM-Element für `node` inkl. Pflicht-/belegter Kinder. */
  private generate(node: TreeNode, depth: number): Element {
    const el = this.createEl(node.name);
    if (this.tree.isLeaf(node)) {
      const v = this.values.placeholderFor({
        name: node.name,
        path: node.path,
        typeName: node.typeName,
        codelist: node.codelist,
      });
      if (node.codelist) {
        if (node.codelist.kennung) el.setAttribute('listURI', node.codelist.kennung);
        const ver = this.values.clVersion(node.codelist);
        if (ver) el.setAttribute('listVersionID', ver);
        const code = this.createCodeEl();
        code.textContent = v;
        el.appendChild(code);
      } else {
        el.textContent = v;
      }
      return el;
    }
    if (depth > 40 || node.recursive) return el;
    this.tree.expandNode(node);
    const cursor: Cursor = { last: null };
    this.generateChildren(node, el, cursor, depth);
    return el;
  }

  private generateChildren(node: TreeNode, el: Element, cursor: Cursor, depth: number): void {
    // Auswahl: genau *ein* Zweig. Das betrifft nicht nur synthetische
    // „(Auswahl)"-Knoten, sondern auch benannte Elemente, deren complexType
    // direkt eine <xs:choice> ist (`auswahl_*` im GDS) — dort traegt der Knoten
    // selbst `model='choice'` und hat die Zweige als direkte Kinder
    // (TreeService.expandNode). Ohne diesen Fall entstuenden alle Zweige.
    if (node.model === 'choice') {
      this.generateChoice(node, el, cursor, depth);
      return;
    }
    for (const c of node.children ?? []) {
      if (c.synthetic) {
        this.tree.expandNode(c); // Zweige/Kinder der Gruppe erst auflösen
        this.generateChildren(c, el, cursor, depth);
        continue;
      }
      if (this.needsGenerate(c)) {
        const child = this.generate(c, depth + 1);
        this.insertAfter(el, cursor.last, child);
        cursor.last = child;
      }
    }
  }

  /**
   * Erzeugt genau einen Zweig einer Auswahl: bevorzugt einen, der ohnehin nötig
   * ist (Pflicht oder im Modell belegt), sonst den ersten nicht ausgeschlossenen.
   * Der gewählte Zweig wird **erzwungen** — wird der Auswahl-Container überhaupt
   * erzeugt, braucht er einen Zweig, unabhängig von dessen eigenem `minOccurs`.
   */
  private generateChoice(node: TreeNode, el: Element, cursor: Cursor, depth: number): void {
    const kinder = node.children ?? [];
    const frei = (x: TreeNode): boolean => this.state.wirkungOf(x.path) !== 'ausgeschlossen';
    const b = kinder.find((x) => this.needsGenerate(x)) ?? kinder.find(frei);
    if (!b) return;
    if (b.synthetic) {
      this.tree.expandNode(b);
      this.generateChildren(b, el, cursor, depth);
      return;
    }
    const child = this.generate(b, depth + 1);
    this.insertAfter(el, cursor.last, child);
    cursor.last = child;
  }

  /** Kind eines neu erzeugten Elements: Pflicht oder im Modell belegt. */
  private needsGenerate(node: TreeNode): boolean {
    if (this.state.wirkungOf(node.path) === 'ausgeschlossen') return false;
    if (this.hasModelContent(node.path)) return true;
    return parseInt(node.min || '1', 10) >= 1;
  }

  // ── Nachrichtenkopf: neue Nachricht ─────────────────────────────────

  /** Setzt neue `eigeneNachrichtenID` (UUID) und aktuellen `erstellungszeitpunkt`. */
  private refreshKopf(outRoot: Element): void {
    const kopf = outRoot.getElementsByTagNameNS('*', 'nachrichtenkopf')[0];
    if (!kopf) return;
    const zeit = this.firstDescendant(kopf, 'erstellungszeitpunkt');
    if (zeit) zeit.textContent = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const id = this.firstDescendant(kopf, 'eigeneNachrichtenID');
    if (id) id.textContent = this.uuid();
  }

  private uuid(): string {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    // Fallback (sollte in modernen Browsern nicht greifen).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = Math.floor(Math.random() * 16);
      const v = ch === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ── Kleine DOM-Helfer ───────────────────────────────────────────────

  private firstDescendant(el: Element, localName: string): Element | null {
    return el.getElementsByTagNameNS('*', localName)[0] ?? null;
  }

  /** Neues Element im Ziel-Dokument, im Namespace/Präfix der Quell-Nachricht. */
  private createEl(name: string): Element {
    const qname = this.prefix ? `${this.prefix}:${name}` : name;
    const el = this.ns
      ? this.outDoc.createElementNS(this.ns, qname)
      : this.outDoc.createElement(name);
    this.erzeugt.add(el); // stammt nicht aus der Quelle (siehe patchLeaf)
    return el;
  }

  /** XOEV-Code: das code-Element ist unqualifiziert (form="unqualified"). */
  private createCodeEl(): Element {
    return this.outDoc.createElementNS(null, 'code');
  }

  private insertAfter(parent: Element, ref: Node | null, el: Element): void {
    parent.insertBefore(el, ref ? ref.nextSibling : parent.firstChild);
  }

  private hasModelContent(path: string): boolean {
    const p = this.state.elemente()[path];
    if (p && (p.beispiel || (p.werte && p.werte.length))) return true;
    const pre1 = path + '/';
    const pre2 = path + '@';
    for (const k of Object.keys(this.state.elemente())) {
      if ((k.startsWith(pre1) || k.startsWith(pre2)) && this.state.elemente()[k]!.beispiel)
        return true;
    }
    for (const k of Object.keys(this.state.auspraegungen())) {
      if (k === path || k.startsWith(pre1) || k.startsWith(pre2)) return true;
    }
    return false;
  }

  // ── Pretty-Serialisierung ───────────────────────────────────────────

  /**
   * Serialisiert das Dokument mit einheitlicher 2-Space-Einrückung. Vorhandene
   * Whitespace-Textknoten (alte Einrückung) werden verworfen und neu gesetzt, so
   * dass geklonte/eingefügte Knoten konsistent formatiert sind. Textinhalte von
   * Blättern bleiben unangetastet.
   *
   * Namespace-Deklarationen stehen im DOM als Attribute und werden dadurch
   * mitgeschrieben — mit einer Ausnahme: ein **selbst erzeugtes**
   * unqualifiziertes Element (XOEV-`code`, `form="unqualified"`) trägt kein
   * `xmlns=""`-Attribut, sondern nur einen leeren Namespace. Ohne die ergänzte
   * Deklaration zöge es beim erneuten Parsen den Default-Namespace des
   * Elternteils an und wäre nicht mehr schema-valide.
   */
  private serializePretty(doc: Document): string {
    const IND = '  ';
    const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
    const rec = (el: Element, depth: number, elternNs: string | null): void => {
      const pad = IND.repeat(depth);
      let attrs = Array.from(el.attributes)
        .map((a) => ` ${a.name}="${esc(a.value)}"`)
        .join('');
      if (el.namespaceURI === null && elternNs && !el.hasAttribute('xmlns'))
        attrs = ' xmlns=""' + attrs;
      const kinder = Array.from(el.children);
      const tag = el.tagName;
      if (kinder.length === 0) {
        const text = el.textContent ?? '';
        if (text.trim() === '') lines.push(`${pad}<${tag}${attrs}/>`);
        else lines.push(`${pad}<${tag}${attrs}>${this.escText(text)}</${tag}>`);
        return;
      }
      lines.push(`${pad}<${tag}${attrs}>`);
      for (const c of kinder) rec(c, depth + 1, el.namespaceURI);
      lines.push(`${pad}</${tag}>`);
    };
    rec(doc.documentElement, 0, null);
    return lines.join('\n') + '\n';
  }

  /**
   * Escaping fuer Textknoten — bewusst OHNE `"`→`&quot;` (anders als `esc`),
   * damit Anfuehrungszeichen in Inhalten beim Re-Export unveraendert bleiben.
   */
  private escText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
