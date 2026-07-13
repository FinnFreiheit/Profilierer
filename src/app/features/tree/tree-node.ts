import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TreeItem, TreeNode as TNode, itemPath } from '../../models/node.model';
import { StateService } from '../../core/services/state.service';
import { TreeService } from '../../core/services/tree.service';
import { ValueService } from '../../core/services/value.service';
import { XsdParserService } from '../../core/services/xsd-parser.service';
import { ToastService } from '../../core/services/toast.service';
import { pretty, kardText } from '../../core/util/pretty.util';
import { REF_LABELS, refKindOf } from '../../core/refs';

interface Tag {
  cls: string;
  text: string;
  title?: string;
  ref?: boolean;
}

/**
 * Ein Kasten im Baum inkl. seiner offenen Kinder (rekursiv). Deklarative
 * Portierung von renderBox (Z.1207-1391) und buildSub (Z.1080-1117).
 *
 * Das Host-Element traegt die Klasse `ntree` und enthaelt direkt `.box` und
 * optional `.nkids` — genau die DOM-Struktur, die die SVG-Verbindungslinien
 * (P6) per Geometrie vermessen. Referenz-/Diff-Linien folgen in P6/P7.
 */
@Component({
  selector: 'app-tree-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ntree' },
  imports: [TreeNode],
  templateUrl: './tree-node.html',
})
export class TreeNode {
  readonly item = input.required<TreeItem>();

  /** Stabiler Key fuer @for. */
  protected keyOf(it: TreeItem): string {
    return itemPath(it);
  }

  protected onTag(t: Tag, e: Event): void {
    if (t.ref) this.onRefTag(e);
  }

  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly values = inject(ValueService);
  private readonly parser = inject(XsdParserService);
  private readonly toast = inject(ToastService);

  /** Der fuer Anzeige/Werte massgebliche Knoten (Element bzw. Elternknoten der Auspraegung). */
  private readonly node = computed<TNode>(() => {
    const it = this.item();
    return it.kind === 'el' ? it.node : it.parentNode;
  });

  protected readonly path = computed(() => itemPath(this.item()));

  protected readonly isRoot = computed(() => {
    const it = this.item();
    return it.kind === 'el' && it.node === this.state.root();
  });

  protected readonly hasNext = computed(() => this.tree.itemHasKids(this.item()));
  protected readonly isOpen = computed(() => this.state.isOpen(this.path()));

  protected readonly showAddAusp = computed(() => {
    if (this.state.readOnly()) return false;
    const it = this.item();
    if (it.kind !== 'el') return false;
    const a = this.state.auspsOf(it.node.path);
    return !!(a && a.length);
  });

  /** Sichtbare Kind-Items (ohne "nur Profil"-ausgeblendete). */
  protected readonly children = computed<TreeItem[]>(() =>
    this.tree.childItems(this.item()).filter((c) => !this.state.boxHidden(itemPath(c))),
  );

  /** Phantom-Kaesten: Elemente, die erst in der Vergleichsversion existieren (Z.1099-1113). */
  protected readonly phantoms = computed<{ name: string; tech: string; kard: string }[]>(() => {
    const diffMap = this.state.diffMap();
    const it = this.item();
    if (!this.state.showDiff() || !diffMap || it.kind !== 'el') return [];
    const ausps = this.state.auspsOf(it.node.path);
    if (ausps && ausps.length) return [];
    const msgName = this.state.msgName() || '';
    const relParent = this.path().replace(/@[^/]+/g, '').slice(msgName.length);
    const vB = this.state.idxB()?.version || '?';
    const out: { name: string; tech: string; kard: string }[] = [];
    for (const [rel, r] of diffMap) {
      if (r.art !== 'neu' || !rel.startsWith(relParent + '/')) continue;
      const rest = rel.slice(relParent.length + 1);
      if (rest.includes('/')) continue;
      const base = rest.split('#')[0]!;
      out.push({ name: pretty(base), tech: base + (r.typ ? ' : ' + r.typ : ''), kard: `neu in ${vB}${r.info ? ' · ' + r.info : ''}` });
    }
    return out;
  });

  /** Das komplette Anzeige-Viewmodel des Kastens (renderBox). */
  protected readonly vm = computed(() => {
    const it = this.item();
    const n = this.node();
    const path = this.path();
    const readOnly = this.state.readOnly();
    const st = this.state.statusOf(path);
    const inhExcl = this.state.inheritedExcluded(path);
    const excluded = st?.wirkung === 'ausgeschlossen';

    // Fokus-Modus (Z.1216-1227).
    let mini = false;
    const sel = this.state.selItem();
    if (this.state.focusMode() && sel) {
      const sp = itemPath(sel);
      const onPath = sp === path || sp.startsWith(path + '/') || sp.startsWith(path + '@');
      let isChild = false;
      if (path.startsWith(sp)) {
        const rest = path.slice(sp.length);
        isChild =
          (rest.startsWith('/') && !rest.slice(1).includes('/') && !rest.slice(1).includes('@')) ||
          (rest.startsWith('@') && !rest.includes('/'));
      }
      mini = !onPath && !isChild;
    }

    const isValueBox =
      it.kind === 'el'
        ? !n.synthetic && this.tree.isLeaf(n)
        : this.tree.isLeaf(this.tree.ctxNode(it.parentNode, it.ausp.id));

    const pe = this.state.elemente()[path] ?? {};
    const ausps = it.kind === 'el' ? this.state.auspsOf(path) : null;

    // Testwert (Z.1243-1257).
    let mv: { text: string; ghost: boolean } | null = null;
    let vin: { value: string; placeholder: string; listId: string | null } | null = null;
    let datalist: { id: string; options: { value: string; label: string }[] } | null = null;
    if (isValueBox) {
      const auto = this.values.placeholderFor({
        name: n.name,
        path,
        typeName: n.typeName,
        codelist: n.codelist,
      });
      mv = { text: pe.beispiel || auto, ghost: !pe.beispiel };
      const listId = 'dl' + n.id + '_' + (it.kind === 'ausp' ? it.ausp.id : 'e');
      const werte = n.codelist ? this.values.clWerte(n.codelist) || [] : [];
      if (werte.length) {
        const allowed = pe.werte && pe.werte.length ? new Set(pe.werte) : null;
        datalist = {
          id: listId,
          options: werte.filter((w) => !allowed || allowed.has(w.value)).slice(0, 300),
        };
      }
      vin = { value: pe.beispiel || '', placeholder: auto, listId: datalist ? listId : null };
    }
    // Betrachtungsmodus: Wert nur anzeigen, kein editierbares Eingabefeld.
    // Belegte Blätter bekommen eine read-only Wertezeile; Codes werden dabei
    // zu ihrem Klartext aufgelöst (Story 4).
    let roVal: { value: string; label: string | null } | null = null;
    if (readOnly) {
      vin = null;
      datalist = null;
      if (isValueBox && pe.beispiel)
        roVal = {
          value: pe.beispiel,
          label: n.codelist ? this.values.labelFor(n.codelist, pe.beispiel) : null,
        };
    }

    // Kardinalitaet (Z.1263-1266).
    let kt: string;
    let kardColor: string;
    let standardHint: string | null = null;
    if (it.kind === 'el') {
      const k = this.state.effKard(n);
      kt = kardText(k.min, k.max);
      if (k.changed) standardHint = kardText(n.min, n.max);
    } else {
      kt = kardText(pe.min || '1', pe.max || '1');
    }
    kardColor = st ? st.farbe : 'var(--muted)';

    // Tags (Z.1270-1313, ohne Diff — P7).
    const tags: Tag[] = [];
    const rk = refKindOf(n);
    if (rk) {
      const rlbl = pe.refZiel
        ? 'Verweis: ' + this.state.auspLabel(pe.refZiel)
        : 'Verweis → ' + (REF_LABELS[rk] || rk);
      tags.push({ cls: 't-ref', text: rlbl + ' ↗', title: 'Zum Verweisziel springen', ref: true });
    }
    if (it.kind === 'el') {
      if (n.inChoice) tags.push({ cls: 't-choice', text: 'Alternative' });
      if (n.model === 'choice') tags.push({ cls: 't-choice', text: 'Auswahl' });
      if (n.codelist) tags.push({ cls: 't-code', text: 'Codeliste' });
      else if (isValueBox && !rk)
        tags.push({ cls: 't-wert', text: 'Wert: ' + this.valueKind(n) });
      if (n.recursive) tags.push({ cls: 't-rec', text: 'rekursiv' });
      if (ausps && ausps.length) tags.push({ cls: 't-ausp', text: ausps.length + ' Ausprägungen' });
    } else if (isValueBox && !rk) {
      tags.push(
        n.codelist
          ? { cls: 't-code', text: 'Codeliste' }
          : { cls: 't-wert', text: 'Wert: ' + this.valueKind(n) },
      );
    }
    if (this.state.hasNotes(path)) tags.push({ cls: 't-note', text: 'Notiz' });

    // Diff-Markierungen (Z.1290-1312).
    let dfR = false;
    let dfA = false;
    const diffMap = this.state.diffMap();
    if (this.state.showDiff() && diffMap && it.kind === 'el') {
      const msgName = this.state.msgName() || '';
      const rel = path.replace(/@[^/]+/g, '').slice(msgName.length);
      const vB = this.state.idxB()?.version || 'neu';
      let ownArt: string | null = null;
      if (!n.synthetic && n !== this.state.root()) {
        const dr = diffMap.get(rel);
        if (dr) {
          ownArt = dr.art;
          if (dr.art === 'entfernt')
            tags.push({ cls: 't-dent', text: `entfällt in ${vB}`, title: `Element ist in Version ${vB} nicht mehr enthalten` });
          else if (dr.art === 'geändert')
            tags.push({ cls: 't-daend', text: `geändert in ${vB}`, title: dr.info });
        }
      }
      const anc = this.state.diffAnc()?.get(rel);
      if (anc) {
        const total = anc.neu + anc.entfernt + anc['geändert'];
        if (total) {
          const det = [anc.neu ? anc.neu + ' neu' : '', anc.entfernt ? anc.entfernt + ' entfernt' : '', anc['geändert'] ? anc['geändert'] + ' geändert' : '']
            .filter(Boolean)
            .join(', ');
          tags.push({ cls: 't-dsub', text: `Δ ${total}`, title: `Unterschiede in untergeordneten Elementen: ${det}` });
        }
      }
      if (ownArt === 'entfernt') dfR = true;
      else if (ownArt || anc) dfA = true;
    }

    const isExcl = !!excluded;
    return {
      dfR,
      dfA,
      kind: it.kind,
      auspBox: it.kind === 'ausp',
      selected: sel ? itemPath(sel) === path : false,
      mini,
      excluded: isExcl,
      exclInherit: !isExcl && inhExcl,
      leafBox: isValueBox,
      parentBox: !isValueBox,
      statusStrip: st ? st.farbe : null,
      title: it.kind === 'ausp' ? it.ausp.name : pretty(n.name),
      refkind: rk,
      refziel: pe.refZiel ?? null,
      mv,
      vin,
      roVal,
      datalist,
      showTech: this.state.showTech() && it.kind === 'el',
      techText: it.kind === 'el' ? n.name + (n.typeName ? ' : ' + n.typeName : '') : '',
      statusName: st?.name ?? '',
      kardText: kt,
      kardColor,
      standardHint,
      doc:
        it.kind === 'el'
          ? n.doc
            ? n.doc.split('\n')[0]!
            : null
          : pe.anmerkung || null,
      tags,
      isValueBox,
      // Buttons (im Betrachtungsmodus ausgeblendet).
      showHide: !readOnly && !this.isRoot() && it.kind === 'el',
      hideIsExcl: isExcl,
      showDelAusp: !readOnly && !this.isRoot() && it.kind === 'ausp',
      showDup:
        !readOnly &&
        !this.isRoot() &&
        (it.kind === 'ausp' || (!n.synthetic && this.tree.isRepeatable(n))),
      dupTitle:
        it.kind === 'ausp'
          ? 'Ausprägung samt Unter-Profilierung kopieren'
          : 'Duplizieren — Element als benannte Fälle (Ausprägungen) führen',
    };
  });

  /** valueKind (Parser, schema-abhaengig). */
  private valueKind(n: TNode): string {
    const idx = this.state.idx();
    return idx ? this.parser.valueKind(n, idx) : 'Wert';
  }

  // ── Aktionen ────────────────────────────────────────────────────────

  protected onSelect(): void {
    const it = this.item();
    this.state.selItem.set(it);
    if (this.tree.itemHasKids(it)) this.state.setOpen(this.path(), true);
  }

  protected onToggle(e: Event): void {
    e.stopPropagation();
    this.state.toggleOpen(this.path());
  }

  protected onValue(e: Event): void {
    const v = (e.target as HTMLInputElement).value.trim();
    this.state.setElementProfile(this.path(), { beispiel: v || undefined });
  }

  protected stop(e: Event): void {
    e.stopPropagation();
  }

  protected onValueKeydown(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  protected onHide(e: Event): void {
    e.stopPropagation();
    const ex = this.state.exclStatus();
    if (!ex) {
      this.toast.show('Kein Status mit Wirkung „ausgeschlossen" konfiguriert (siehe „Status…").');
      return;
    }
    const isExcl = this.vm().hideIsExcl;
    this.state.setElementProfile(this.path(), { status: isExcl ? undefined : ex.id });
  }

  protected onDup(e: Event): void {
    e.stopPropagation();
    const it = this.item();
    if (it.kind === 'ausp') this.state.copyAusp(it.parentNode.path, it.ausp.id);
    else this.state.duplicateElement(this.path());
  }

  protected onDelAusp(e: Event): void {
    e.stopPropagation();
    const it = this.item();
    if (it.kind !== 'ausp') return;
    if (confirm('Ausprägung „' + it.ausp.name + '" samt Unter-Profilierung löschen?'))
      this.state.removeAusp(it.parentNode.path, it.ausp.id);
  }

  protected onAddAusp(): void {
    const it = this.item();
    if (it.kind === 'el') this.state.addAusp(it.node.path);
  }

  protected onRefTag(e: Event): void {
    e.stopPropagation();
    // Sprung zum Verweisziel folgt in P6 (redrawLines/jumpTo).
    this.toast.show('Verweis-Navigation folgt (Phase P6).');
  }
}
