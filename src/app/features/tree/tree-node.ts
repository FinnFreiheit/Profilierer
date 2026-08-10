import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TreeItem, TreeNode as TNode, itemPath } from '../../models/node.model';
import { unterPfad } from '../../core/util/pfad.util';
import { StateService } from '../../core/services/state.service';
import { TreeService } from '../../core/services/tree.service';
import { ErweiterungDialogService } from '../../core/services/erweiterung-dialog.service';
import { NavService } from '../../core/services/nav.service';
import { GuidedService } from '../../core/services/guided.service';
import { ValueService } from '../../core/services/value.service';
import { XsdParserService } from '../../core/services/xsd-parser.service';
import { ToastService } from '../../core/services/toast.service';
import { HinweisStoreService } from '../../core/services/hinweis-store.service';
import { pretty } from '../../core/util/pretty.util';
import { datentypAnzeige } from '../../core/util/datentyp.util';
import { erwLoeschFrage, erwTypFehltText } from '../../core/util/erweiterung.util';
import { REF_LABELS, refKindOf } from '../../core/refs';
import { TreeContextMenu } from './tree-context-menu';

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
 * optional `.nkids` — genau die DOM-Struktur, die der TreeCanvas fuer die
 * SVG-Verbindungs- und Verweislinien per Geometrie vermisst.
 */
@Component({
  selector: 'app-tree-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ntree' },
  imports: [TreeNode, TreeContextMenu],
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
  private readonly erwDialog = inject(ErweiterungDialogService);
  private readonly nav = inject(NavService);
  private readonly guided = inject(GuidedService);
  private readonly values = inject(ValueService);
  private readonly parser = inject(XsdParserService);
  private readonly toast = inject(ToastService);
  private readonly hinweise = inject(HinweisStoreService);

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
  /** Nachrichten-Modus (Instanz statt Profil): steuert die Beschriftungen. */
  protected readonly msgMode = this.state.msgMode;

  protected readonly showAddAusp = computed(() => {
    if (this.state.readOnly()) return false;
    const it = this.item();
    if (it.kind !== 'el') return false;
    const a = this.state.auspsOf(it.node.path);
    return !!(a && a.length);
  });

  /**
   * Gefuehrter Durchlauf: Grund, warum „+ Vorkommen" gesperrt ist (Issue #27) —
   * null, solange die Hoechstanzahl nicht erreicht ist.
   */
  protected readonly addAuspSperre = computed(() => {
    const it = this.item();
    if (!this.showAddAusp() || it.kind !== 'el') return null;
    return this.guided.kardSperreHinzu(it.node.path);
  });

  /** "+ Element (Erweiterung)" nur an aufklappbaren Containern (US Schema-Erweiterung). */
  protected readonly showAddErweiterung = computed(() => {
    if (this.state.readOnly() || this.state.msgMode()) return false;
    const it = this.item();
    if (it.kind === 'el') {
      const n = it.node;
      if (n.synthetic || n.recursive) return false;
      if (this.state.auspsOf(n.path)?.length) return false;
      // Erweiterungsknoten folgen derselben Regel (#97): wo Kinder Platz haben,
      // darf eine Nachbeauftragung dazu — unter einem Wert- oder
      // Codelisten-Typ nicht.
      return !this.tree.isLeaf(n);
    }
    const cn = this.tree.ctxNode(it.parentNode, it.ausp.id);
    return !cn.recursive && !this.tree.isLeaf(cn);
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
    const relParent = this.path()
      .replace(/@[^/]+/g, '')
      .slice(msgName.length);
    const vB = this.state.idxB()?.version || '?';
    const out: { name: string; tech: string; kard: string }[] = [];
    for (const [rel, r] of diffMap) {
      if (r.art !== 'neu' || !rel.startsWith(relParent + '/')) continue;
      const rest = rel.slice(relParent.length + 1);
      if (rest.includes('/')) continue;
      const base = rest.split('#')[0]!;
      out.push({
        name: pretty(base),
        tech: base + (r.typ ? ' : ' + r.typ : ''),
        kard: `neu in ${vB}${r.info ? ' · ' + r.info : ''}`,
      });
    }
    return out;
  });

  /**
   * Die XSD-Attribute des Knotens als Anzeigezeile. Attribute sind kein Teil
   * des Element-Baums (`TreeNode` entsteht ausschliesslich aus `xs:element`) —
   * sie gehoeren zum Kasten ihres Elements und stehen deshalb *in* ihm, nicht
   * als eigene Kaesten darunter. Das traegt auch fuer Blaetter, die gar keinen
   * aufklappbaren Unterbau haben (Code.*-Elemente mit listURI/listVersionID).
   *
   * Am Container eines Elements mit Vorkommen bleibt die Zeile weg: dort
   * stehen die Attribute an den Vorkommen selbst, sonst staende dasselbe
   * Attribut n+1 Mal untereinander.
   */
  protected readonly attribute = computed<
    { name: string; pflicht: boolean; wert: string | null; title: string }[]
  >(() => {
    const idx = this.state.idx();
    const it = this.item();
    if (!idx) return [];
    if (it.kind === 'el' && this.tree.vorkommenKinder(it.node)) return [];
    const n = this.node();
    return this.parser.attributeOf(n, idx).map((a) => {
      // Codelisten-Attribute schreibt der Generator aus den Codelisten-Angaben,
      // nicht aus `fixed` (die hinterlegte Fassung kann neuer sein) — der Baum
      // zeigt denselben Wert, den die Nachricht bekaeme.
      const clWert =
        n.codelist && a.name === 'listURI'
          ? n.codelist.kennung || null
          : n.codelist && a.name === 'listVersionID'
            ? this.values.clVersion(n.codelist)
            : null;
      const wert = clWert ?? this.values.attributWert(a, n);
      // Der Wert gehoert in den Titel: die Zeile kuerzt lange Codelisten-
      // Kennungen ab, sonst waere er nirgends vollstaendig zu lesen.
      const teile = [
        `Attribut ${a.name}`,
        wert ? `Wert: ${wert}` : null,
        a.typ ? `Typ: ${a.typ}` : null,
        a.pflicht ? 'Pflicht' : 'optional',
        a.fixed != null ? `fester Wert: ${a.fixed}` : null,
        a.doc || null,
      ].filter(Boolean);
      return { name: a.name, pflicht: a.pflicht, wert, title: teile.join(' · ') };
    });
  });

  /** Das komplette Anzeige-Viewmodel des Kastens (renderBox). */
  protected readonly vm = computed(() => {
    const it = this.item();
    const n = this.node();
    const path = this.path();
    // Gebundener Durchlauf: von der Profilierung Ausgeschlossenes ist gesperrt —
    // kein Eingabefeld, keine Aktionen (US "Testnachricht aus einer
    // Profilierung"). Sichtbar wird es nur ueber "nur Profil" (boxHidden).
    const gesperrt = this.state.vorgabeGesperrt(path);
    const readOnly = this.state.readOnly() || gesperrt;
    const st = this.state.statusOf(path);
    const inhExcl = this.state.inheritedExcluded(path);
    const excluded = st?.wirkung === 'ausgeschlossen';

    // Fokus-Modus (Z.1216-1227).
    let mini = false;
    const sel = this.state.selItem();
    if (this.state.focusMode() && sel) {
      const sp = itemPath(sel);
      const onPath = unterPfad(sp, path);
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
    let mv: { text: string; ghost: boolean; title: string | null } | null = null;
    let vin: {
      value: string;
      placeholder: string;
      listId: string | null;
      problem: string | null;
      label: string | null;
    } | null = null;
    let datalist: { id: string; options: { value: string; label: string }[] } | null = null;
    if (isValueBox) {
      const auto = this.values.placeholderFor({
        name: n.name,
        path,
        typeName: n.typeName,
        codelist: n.codelist,
      });
      // Codes zu Klartext aufloesen — auch beim Bearbeiten. Der Code allein
      // ("252") sagt beim Befuellen einer Testnachricht nichts; die Bedeutung
      // stand bisher nur im Auswahl-Dropdown und im Betrachtungsmodus. Der Code
      // bleibt vorn: er ist der Wert, der in der Nachricht steht.
      const wertLabel = n.codelist ? this.values.labelFor(n.codelist, pe.beispiel) : null;
      mv = {
        text: pe.beispiel ? (wertLabel ? pe.beispiel + ' · ' + wertLabel : pe.beispiel) : auto,
        ghost: !pe.beispiel,
        // Im Mini-Kasten ist der Platz knapp — der volle Text steht im Tooltip.
        title: wertLabel ? pe.beispiel + ' · ' + wertLabel : null,
      };
      const listId = 'dl' + n.id + '_' + (it.kind === 'ausp' ? it.ausp.id : 'e');
      const werte = n.codelist ? this.values.clWerte(n.codelist) || [] : [];
      if (werte.length) {
        // Effektive Einschraenkung: im gebundenen Durchlauf steht sie in der
        // Vorgabe. Verglichen wird der reine Code (manuelle Eintraege tragen
        // ihre Beschreibung mit).
        const eingeschraenkt = this.state.werteOf(path);
        const allowed = eingeschraenkt
          ? new Set(this.values.werteZeilen(eingeschraenkt).map((w) => w.value))
          : null;
        datalist = {
          id: listId,
          options: werte.filter((w) => !allowed || allowed.has(w.value)).slice(0, 300),
        };
      }
      // Typwidrige Testwerte sichtbar machen (Pattern-/Builtin-/Codelisten-Pruefung).
      const problem = pe.beispiel
        ? this.values.wertProblem(
            { name: n.name, path, typeName: n.typeName, codelist: n.codelist },
            pe.beispiel,
          )
        : null;
      vin = {
        value: pe.beispiel || '',
        placeholder: auto,
        listId: datalist ? listId : null,
        problem,
        label: wertLabel,
      };
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

    // Kardinalitaet (Z.1263-1266) — dieselbe Lesart wie Druck und Excel.
    const { text: kt, standard: standardHint } = this.state.kardAnzeige({
      kind: it.kind,
      node: n,
      path,
    });
    const kardColor: string = st ? st.farbe : 'var(--muted)';

    // Tags (Z.1270-1313, ohne Diff — P7).
    const tags: Tag[] = [];
    if (n.erweiterung) {
      tags.push({
        cls: 't-ext',
        text: 'Schema-Erweiterung',
        title: 'Nachbeauftragung — Element ist nicht im XJustiz-Schema enthalten',
      });
      // Typ-Pill: unter einem komplexen Typ haengt der halbe Baum, das gehoert
      // an den Kasten (#97). Ein Container traegt keinen Typ.
      if (n.erweiterung.datentyp)
        tags.push({
          cls: 't-typ',
          text: datentypAnzeige(n.erweiterung),
          title: 'Datentyp der Nachbeauftragung',
        });
      const fehlt = this.tree.erwTypFehlt(n);
      if (fehlt)
        tags.push({
          cls: 't-typerr',
          text: 'Typ fehlt im Schema',
          title: erwTypFehltText(fehlt, this.state.idx()?.version),
        });
    }
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
      else if (isValueBox && !rk) tags.push({ cls: 't-wert', text: 'Wert: ' + this.valueKind(n) });
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
    // Hinweise: offene am Element, Aggregat fuer den Teilbaum.
    const offen = this.hinweise.offeneJePfad().get(path);
    if (offen?.length)
      tags.push({
        cls: 't-hint',
        text: offen.length === 1 ? 'Hinweis' : offen.length + ' Hinweise',
        title: offen.map((h) => h.text).join('\n'),
      });
    const hSub = this.hinweise.anc().get(path);
    if (hSub)
      tags.push({
        cls: 't-hsub',
        text: hSub + (hSub === 1 ? ' Hinweis' : ' Hinweise'),
        title: 'Offene Hinweise in untergeordneten Elementen',
      });
    // Gebundener Durchlauf: Sperre samt Begruendung sichtbar machen.
    if (gesperrt)
      tags.push({
        cls: 't-lock',
        text: 'Profil: nicht verwendet',
        title:
          (this.state.vorgabeSchliesstAus(path)
            ? 'Die gebundene Profilierung schließt dieses Element aus — nicht befüllbar.'
            : 'Übergeordnetes Element ist ausgeschlossen — der Teilbaum entfällt.') +
          (this.state.anmerkungOf(path) ? '\n' + this.state.anmerkungOf(path) : ''),
      });
    // Gebundener Durchlauf: was die Profilierung offen laesst bzw. gar nicht
    // anspricht, sichtbar kennzeichnen (US "Profil-Wirkungen und Marker").
    const marker = this.guided.markerOf(path);
    if (marker === 'zuklaeren')
      tags.push({
        cls: 't-klaeren',
        text: 'zu klären',
        title:
          'Die gebundene Profilierung markiert dieses Element nur — die fachliche Frage ist offen. Es verhält sich wie ein optionales Element.',
      });
    else if (marker === 'nichtprofiliert')
      tags.push({
        cls: 't-nprof',
        text: 'nicht profiliert',
        title:
          'Die gebundene Profilierung sagt zu diesem Element nichts — es folgt der Schema-Semantik. Die Testnachricht geht insoweit über das Szenario hinaus.',
      });
    // Gefuehrter Instanz-Durchlauf: Stationen nach ihrer Verbindlichkeit
    // einfaerben — grün, was die Nachricht verlangt, orange, was frei ist
    // (dieselben Farben wie die Dispositionen der Profilierung, ADR 0016).
    const stationArt = this.state.guided() && !readOnly ? this.guided.stationArt(path) : null;
    if (stationArt === 'pflicht')
      tags.push({
        cls: 't-mand',
        text: 'Pflicht',
        title:
          'Die Nachricht verlangt diese Angabe — der Durchlauf blättert nicht darüber hinweg, solange sie fehlt.',
      });
    else if (stationArt === 'frei')
      tags.push({
        cls: 't-frei',
        text: 'optional',
        title:
          'Freie Angabe — ein Wert bringt das Element in die Nachricht, ohne Wert entfällt es. Mit ↓ übergehen.',
      });

    // Gefuehrter Modus: offene Entscheidungspunkte markieren.
    if (this.state.guided() && !readOnly && this.guided.offeneSet().has(path))
      tags.push({ cls: 't-open', text: 'offen', title: 'Entscheidung steht noch aus' });

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
            tags.push({
              cls: 't-dent',
              text: `entfällt in ${vB}`,
              title: `Element ist in Version ${vB} nicht mehr enthalten`,
            });
          else if (dr.art === 'geändert')
            tags.push({ cls: 't-daend', text: `geändert in ${vB}`, title: dr.info });
        }
      }
      const anc = this.state.diffAnc()?.get(rel);
      if (anc) {
        const total = anc.neu + anc.entfernt + anc['geändert'];
        if (total) {
          const det = [
            anc.neu ? anc.neu + ' neu' : '',
            anc.entfernt ? anc.entfernt + ' entfernt' : '',
            anc['geändert'] ? anc['geändert'] + ' geändert' : '',
          ]
            .filter(Boolean)
            .join(', ');
          tags.push({
            cls: 't-dsub',
            text: `Δ ${total}`,
            title: `Unterschiede in untergeordneten Elementen: ${det}`,
          });
        }
      }
      if (ownArt === 'entfernt') dfR = true;
      else if (ownArt || anc) dfA = true;
    }

    // Schemavalidierungs-Marker des letzten Prueflaufs (ValidationMarkerService).
    // Schluessel ist der volle Pfad inkl. @auspId — gilt fuer Elemente und
    // Auspraegungen, daher anders als der Diff keine Pfad-Normalisierung.
    let valErr = false;
    const vf = this.state.valFehler();
    if (vf) {
      const eigene = vf.get(path);
      if (eigene) {
        valErr = true;
        tags.push({ cls: 't-verr', text: 'Schema-Fehler', title: eigene.join('\n') });
      }
      const sub = this.state.valAnc()?.get(path);
      if (sub)
        tags.push({
          cls: 't-vsub',
          text: sub + ' Fehler',
          title: 'Schemafehler in untergeordneten Elementen',
        });
    }

    const isExcl = !!excluded;
    // Nachrichten-Modus: dieselben Bedienelemente, andere Sprache — in einer
    // Instanz gibt es keine Profilierung, sondern Angaben und Vorkommen.
    const msgMode = this.state.msgMode();

    // Belegte Angaben hervorheben: beim Befuellen einer Testnachricht ist die
    // erste Frage, wo schon etwas steht. Das Eingabefeld allein beantwortet sie
    // nicht — ein Platzhalter sieht einem Wert zu aehnlich, und ein zugeklappter
    // Ast zeigt gar nichts. Blatt mit eigenem Wert: Haken und Toenung;
    // Container: Zaehler der belegten Angaben darunter.
    const hervor = this.state.wertHervorhebung() && !this.state.entfaellt(path);
    const belegt = hervor && this.state.hatTestwert(path);
    const belegtSub = hervor ? this.state.belegtImAst(path) : 0;

    // Vorkommen anlegen/entfernen (Buttons ⧉ und ✕) — nur wo sie erscheinen,
    // wird die Kardinalitaets-Sperre ermittelt (Baumweg-Suche je Knoten).
    const zeigtDelAusp = !readOnly && !this.isRoot() && it.kind === 'ausp';
    const zeigtDup =
      !readOnly &&
      !this.isRoot() &&
      !n.erweiterung &&
      (it.kind === 'ausp' || (!n.synthetic && this.tree.isRepeatable(n)));
    return {
      dfR,
      dfA,
      valErr,
      extBox: !!n.erweiterung,
      kind: it.kind,
      auspBox: it.kind === 'ausp',
      selected: sel ? itemPath(sel) === path : false,
      mini,
      excluded: isExcl,
      exclInherit: !isExcl && inhExcl,
      leafBox: isValueBox,
      parentBox: !isValueBox,
      belegt,
      belegtSub: belegtSub || null,
      // Im Durchlauf gewinnt die Farbe der Station: sie sagt, was die Nachricht
      // verlangt — und bleibt anders als die Tags auch im Mini-Kasten sichtbar.
      // Sonst wie bisher die Farbe der gesetzten Statusstufe.
      statusStrip:
        stationArt === 'pflicht'
          ? '#1D9E75'
          : stationArt === 'frei'
            ? '#BA7517'
            : st
              ? st.farbe
              : null,
      title: it.kind === 'ausp' ? it.ausp.name : pretty(n.name),
      refkind: rk,
      refziel: pe.refZiel ?? null,
      mv,
      vin,
      roVal,
      datalist,
      showTech: this.state.showTech() && it.kind === 'el',
      techText: it.kind === 'el' ? n.name + (n.typeName ? ' : ' + n.typeName : '') : '',
      statusName: msgMode ? (isExcl ? 'entfernt' : '') : (st?.name ?? ''),
      kardText: kt,
      kardColor,
      standardHint,
      doc: it.kind === 'el' ? (n.doc ? n.doc.split('\n')[0]! : null) : pe.anmerkung || null,
      tags,
      isValueBox,
      // Buttons (im Betrachtungsmodus ausgeblendet).
      showHide: !readOnly && !this.isRoot() && it.kind === 'el' && !n.erweiterung,
      hideIsExcl: isExcl,
      hideMsgMode: msgMode,
      // Gefuehrter Durchlauf: Grund, warum die Angabe nicht entfernt werden darf
      // (Mindestanzahl der Profilierung, Issue #50) — null, wenn frei.
      hideSperre: isExcl ? null : this.guided.kardSperreWeglassen(path),
      showDelAusp: zeigtDelAusp,
      // Die Schema-Erweiterungen der gebundenen Fassung sind Vorgabe, nicht
      // disponibel: sie wegzuloeschen machte die Nachricht profilwidrig (die
      // zwingend gesetzten Elemente fehlten). Angelegt werden koennen im
      // Durchlauf ohnehin keine (showAddErweiterung ist im msgMode aus).
      showDelErw: !readOnly && it.kind === 'el' && !!n.erweiterung && !this.state.hatVorgabe(),
      showDup: zeigtDup,
      // Kardinalitaet des Durchlaufs: Grund der Sperre bzw. null (Issue #27).
      // Massgeblich ist immer das Traegerelement, auch an einem Vorkommen.
      dupSperre: zeigtDup ? this.guided.kardSperreHinzu(n.path) : null,
      delAuspSperre: zeigtDelAusp ? this.guided.kardSperreEntfernen(n.path) : null,
      dupTitle: msgMode
        ? it.kind === 'ausp'
          ? 'Vorkommen samt Werten kopieren'
          : 'Weiteres Vorkommen dieses Elements anlegen'
        : it.kind === 'ausp'
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
    const input = e.target as HTMLInputElement;
    const v = input.value.trim();
    // Nachrichten-Modus: die Werte-Einschraenkung der Profilierung ist hart —
    // ein nicht freigegebener Wert wird nicht uebernommen (Spec "Codelisten
    // hart einschraenken"). Beim Profilieren bleibt der Beispielwert frei.
    const verstoss = this.state.msgMode() ? this.values.werteVerstoss(this.path(), v) : null;
    if (verstoss) {
      this.toast.show(verstoss + ' Zulässig sind nur die Werte aus der Liste.');
      input.value = this.state.elemente()[this.path()]?.beispiel ?? '';
      return;
    }
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
    // Wie bei „+ Vorkommen": die Sperre haengt nicht allein an der Darstellung.
    if (!isExcl && this.meldeSperre(this.guided.kardSperreWeglassen(this.path()))) return;
    this.state.setElementProfile(this.path(), { status: isExcl ? undefined : ex.id });
  }

  protected onDup(e: Event): void {
    e.stopPropagation();
    if (this.meldeSperre(this.guided.kardSperreHinzu(this.node().path))) return;
    const it = this.item();
    if (it.kind === 'ausp') this.state.copyAusp(it.parentNode.path, it.ausp.id);
    else this.state.duplicateElement(this.path());
  }

  protected onDelAusp(e: Event): void {
    e.stopPropagation();
    const it = this.item();
    if (it.kind !== 'ausp') return;
    // Zwei Sperren, zwei Gruende: die Anzahl (Mindestanzahl der Profilierung)
    // und die Identitaet dieses Vorkommens (zwingend gesetzt, #28).
    if (
      this.meldeSperre(
        this.guided.auspSperreEntfernen(it.parentNode.path, it.ausp.id) ??
          this.guided.kardSperreEntfernen(it.parentNode.path),
      )
    )
      return;
    const frage = this.state.msgMode()
      ? 'Vorkommen „' + it.ausp.name + '" samt Werten löschen?'
      : 'Ausprägung „' + it.ausp.name + '" samt Unter-Profilierung löschen?';
    if (confirm(frage)) this.state.removeAusp(it.parentNode.path, it.ausp.id);
  }

  protected onAddAusp(): void {
    const it = this.item();
    if (it.kind !== 'el') return;
    if (this.meldeSperre(this.guided.kardSperreHinzu(it.node.path))) return;
    // Gebundener Durchlauf mit profilierten Auspraegungen: kein leeres Vorkommen,
    // sondern die Kopie einer profilierten Auspraegung (#28). Gibt es nur eine,
    // ist die Wahl eindeutig; sonst faellt sie im Detailbereich, wo jede Quelle
    // ihren Knopf hat.
    const kandidaten = this.guided.auspKopieKandidaten(it.node.path);
    if (kandidaten) {
      if (kandidaten.length === 1) {
        this.state.copyAusp(it.node.path, kandidaten[0]!.id);
        return;
      }
      this.state.selItem.set(it);
      this.toast.show('Bitte im Detailbereich wählen, welche Ausprägung kopiert wird.');
      return;
    }
    this.state.addAusp(it.node.path);
  }

  /**
   * Gesperrte Kardinalitaet begruenden statt sie stillschweigend zu ignorieren
   * (Issue #27). true = gesperrt, der Aufrufer bricht ab.
   */
  private meldeSperre(grund: string | null): boolean {
    if (!grund) return false;
    this.toast.show(grund);
    return true;
  }

  /** Oeffnet den Erweiterungs-Dialog fuer ein neues Element unter diesem Knoten. */
  protected onAddErweiterung(): void {
    const it = this.item();
    const parent = it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
    const namen = this.tree
      .kinder(parent)
      .filter((c) => !c.synthetic)
      .map((c) => c.name);
    this.erwDialog.oeffneNeu(this.path(), namen);
  }

  /** Loescht eine Schema-Erweiterung samt Unter-Profilierung. */
  protected onDelErw(e: Event): void {
    e.stopPropagation();
    const n = this.node();
    if (!n.erweiterung) return;
    // Der **letzte** '/~': bei verschachtelten Erweiterungen liegt der
    // Elternpfad vor der innersten, nicht vor der aeussersten.
    const i = n.path.lastIndexOf('/~');
    if (i < 0) return;
    if (confirm(erwLoeschFrage(n.erweiterung.name, this.state.festlegungenUnter(n.path))))
      this.state.removeErweiterung(n.path.slice(0, i), n.erweiterung.id);
  }

  // ── Kontextmenue: Teilbaum aus-/einklappen (Rechtsklick) ────────────

  /** Offenes Kontextmenue dieses Kastens (Mausposition), sonst null. */
  protected readonly menu = signal<{ x: number; y: number } | null>(null);

  /**
   * Rechtsklick auf den Kasten: Menue nur an aufklappbaren Knoten — auf
   * Blaettern kein preventDefault, dort bleibt das native Browser-Menue.
   * Selektiert nicht (Auswahl und Detailpanel bleiben unveraendert).
   */
  protected onContextMenu(e: MouseEvent): void {
    if (!this.tree.itemHasKids(this.item())) return;
    e.preventDefault();
    this.menu.set({ x: e.clientX, y: e.clientY });
  }

  protected onMenuAusklappen(): void {
    this.menu.set(null);
    if (!this.nav.expandSubtree(this.item()))
      this.toast.show('Teilbaum zu groß — nur teilweise ausgeklappt');
  }

  protected onMenuEinklappen(): void {
    this.menu.set(null);
    this.state.closeSubtree(this.path());
  }

  /** Sprung zum festgelegten Verweisziel (wie refJump im Detailpanel). */
  protected onRefTag(e: Event): void {
    e.stopPropagation();
    const ziel = this.state.elemente()[this.path()]?.refZiel;
    if (ziel) this.nav.jumpTo(ziel);
    else this.toast.show('Kein Verweisziel festgelegt — Ziel im Detailbereich wählen.');
  }
}
