import { Injectable, inject } from '@angular/core';
import { EnumWert } from '../../models/codelist.model';
import { Auspraegung } from '../../models/profile.model';
import { TreeItem, TreeNode, itemPath } from '../../models/node.model';
import { StateService } from '../services/state.service';
import { TreeService } from '../services/tree.service';
import { GuidedService } from '../services/guided.service';
import { ValueService } from '../services/value.service';
import { XsdParserService } from '../services/xsd-parser.service';
import { HinweisStoreService } from '../services/hinweis-store.service';
import { UeberlagerungService } from '../services/ueberlagerung.service';
import { unterPfad } from '../util/pfad.util';
import { pretty } from '../util/pretty.util';
import { datentypAnzeige } from '../util/datentyp.util';
import { erwTypFehltText } from '../util/erweiterung.util';
import { REF_LABELS, refKindOf } from '../refs';
import { sperrGrundText } from './sperrgrund';

/** Ein Kennzeichen am Kasten (Tag-Katalog). */
export interface Kennzeichen {
  cls: string;
  text: string;
  title?: string;
  /** Verweis-Tag: Klick springt zum Ziel. */
  ref?: boolean;
}

/** Der Wert eines Blattes, wie er im Kasten steht (Anzeige, nicht Eingabe). */
export interface Wertanzeige {
  text: string;
  /** Platzhalter statt eigenem Wert. */
  ghost: boolean;
  title: string | null;
}

/** Das Eingabefeld eines Blattes (entfaellt im Betrachtungsmodus). */
export interface Werteingabe {
  value: string;
  placeholder: string;
  listId: string | null;
  problem: string | null;
  label: string | null;
}

/**
 * Alles, was ein Kasten im Baum anzeigt. Die Aussage steht hier, nicht in der
 * Komponente — dieselbe Ableitung speist Baum, Druck und Excel (`entfaellt`,
 * `kardAnzeige` im StateService), und sie ist ohne DOM pruefbar.
 */
export interface Kastenansicht {
  kind: 'el' | 'ausp';
  auspBox: boolean;
  extBox: boolean;
  title: string;
  /** Fokus-Modus: Kasten abseits des gewaehlten Astes wird klein dargestellt. */
  mini: boolean;
  selected: boolean;
  /** Selbst ausgeschlossen bzw. nur geerbt — der Kasten faerbt beides anders. */
  excluded: boolean;
  exclInherit: boolean;
  leafBox: boolean;
  parentBox: boolean;
  isValueBox: boolean;
  /** Belegte Angabe (Blatt) bzw. Zahl belegter Angaben darunter (Container). */
  belegt: boolean;
  belegtSub: number | null;
  statusStrip: string | null;
  statusName: string;
  kardText: string;
  kardColor: string;
  standardHint: string | null;
  doc: string | null;
  showTech: boolean;
  techText: string;
  refkind: string | null;
  refziel: string | null;
  mv: Wertanzeige | null;
  vin: Werteingabe | null;
  roVal: { value: string; label: string | null } | null;
  datalist: { id: string; options: EnumWert[] } | null;
  kennzeichen: Kennzeichen[];
  /** Diff: entfaellt in der Vergleichsversion / anderweitig geaendert. */
  dfR: boolean;
  dfA: boolean;
  valErr: boolean;
  // ── Bedienelemente (im Betrachtungsmodus ausgeblendet) ──────────────
  showHide: boolean;
  hideIsExcl: boolean;
  hideMsgMode: boolean;
  hideSperre: string | null;
  showDelAusp: boolean;
  showDelErw: boolean;
  showDup: boolean;
  dupSperre: string | null;
  delAuspSperre: string | null;
  dupTitle: string;
}

/** Ein XSD-Attribut, wie es im Kasten steht. */
export interface Attributanzeige {
  name: string;
  pflicht: boolean;
  wert: string | null;
  title: string;
}

/** Ein Element, das erst in der Vergleichsversion existiert (Phantom-Kasten). */
export interface Phantomkasten {
  name: string;
  tech: string;
  kard: string;
}

/**
 * Die Anzeige-Ableitung eines Baumkastens — was `renderBox` (Z.1207-1391) sagt,
 * ohne zu sagen, wie es aussieht.
 *
 * Warum ein eigenes Modul: die Ableitung lag als 385-Zeilen-`computed` in der
 * Komponente. Sie war damit nur ueber DOM-Selektoren pruefbar (vom Tag-Katalog
 * mit 20 Kennzeichen waren drei getestet), und ihre Regeln standen ein zweites
 * Mal im Druck (`ExportService.buildPrintRows`) und im Excel-Blatt. Der Seam
 * liegt hier, weil die Aussage fachlich ist und die Darstellung nicht: die
 * Komponente rendert nur noch.
 *
 * Die vier Methoden sind bewusst getrennt und nicht ein Objekt: die Komponente
 * haelt je ein `computed` darauf, damit ein Tastendruck im Wertfeld nicht den
 * Tag-Katalog und die Kinderliste neu ableitet.
 */
@Injectable({ providedIn: 'root' })
export class BaumkastenAnsicht {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly guided = inject(GuidedService);
  private readonly values = inject(ValueService);
  private readonly parser = inject(XsdParserService);
  private readonly hinweise = inject(HinweisStoreService);
  private readonly ueberlagerung = inject(UeberlagerungService);

  /** „+ Vorkommen" erscheint nur, wo das Element schon benannte Vorkommen fuehrt. */
  zeigtVorkommenHinzu(it: TreeItem): boolean {
    if (this.state.readOnly() || it.kind !== 'el') return false;
    const a = this.state.auspsOf(it.node.path);
    return !!(a && a.length);
  }

  /**
   * Gefuehrter Durchlauf: Grund, warum „+ Vorkommen" gesperrt ist (Issue #27) —
   * null, solange die Hoechstanzahl nicht erreicht ist.
   */
  vorkommenHinzuSperre(it: TreeItem): string | null {
    if (!this.zeigtVorkommenHinzu(it) || it.kind !== 'el') return null;
    return this.guided.kardSperreHinzu(it.node.path);
  }

  /** „+ Element (Erweiterung)" nur an aufklappbaren Containern (US Schema-Erweiterung). */
  zeigtErweiterungHinzu(it: TreeItem): boolean {
    if (this.state.readOnly() || this.state.msgMode()) return false;
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
  }

  /**
   * Die sichtbaren Kind-Items — ohne die vom „nur Profil"-/„nur Werte"-Filter
   * verdeckten und, in der Nachrichten-Ueberlagerung, ohne die Aeste, in denen
   * alle gewaehlten Nachrichten dasselbe sagen („nur Abweichungen").
   */
  kinder(it: TreeItem): TreeItem[] {
    return this.tree
      .childItems(it)
      .filter(
        (c) => !this.state.boxHidden(itemPath(c)) && !this.ueberlagerung.verdeckt(itemPath(c)),
      );
  }

  /**
   * Die XSD-Attribute des Knotens. Attribute sind kein Teil des Element-Baums
   * (`TreeNode` entsteht ausschliesslich aus `xs:element`) — sie gehoeren zum
   * Kasten ihres Elements und stehen deshalb *in* ihm, nicht als eigene Kaesten
   * darunter. Das traegt auch fuer Blaetter, die gar keinen aufklappbaren
   * Unterbau haben (Code.*-Elemente mit listURI/listVersionID).
   *
   * Am Container eines Elements mit Vorkommen bleibt die Zeile weg: dort stehen
   * die Attribute an den Vorkommen selbst, sonst staende dasselbe Attribut n+1
   * Mal untereinander.
   */
  attribute(it: TreeItem): Attributanzeige[] {
    const idx = this.state.idx();
    if (!idx) return [];
    if (it.kind === 'el' && this.tree.vorkommenKinder(it.node)) return [];
    const n = this.knoten(it);
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
  }

  /** Elemente, die erst in der Vergleichsversion existieren (Z.1099-1113). */
  phantome(it: TreeItem): Phantomkasten[] {
    const diffMap = this.state.diffMap();
    if (!this.state.showDiff() || !diffMap || it.kind !== 'el') return [];
    const ausps = this.state.auspsOf(it.node.path);
    if (ausps && ausps.length) return [];
    const relParent = this.relativerPfad(itemPath(it));
    const vB = this.state.idxB()?.version || '?';
    const out: Phantomkasten[] = [];
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
  }

  /** Das komplette Anzeige-Modell eines Kastens (renderBox). */
  kasten(it: TreeItem): Kastenansicht {
    const n = this.knoten(it);
    const path = itemPath(it);
    // Gebundener Durchlauf: von der Profilierung Ausgeschlossenes ist gesperrt —
    // kein Eingabefeld, keine Aktionen (US "Testnachricht aus einer
    // Profilierung"). Sichtbar wird es nur ueber "nur Profil" (boxHidden).
    const gesperrt = this.state.vorgabeGesperrt(path);
    const readOnly = this.state.readOnly() || gesperrt;
    const st = this.state.statusOf(path);
    const inhExcl = this.state.inheritedExcluded(path);
    const isExcl = st?.wirkung === 'ausgeschlossen';
    const isRoot = it.kind === 'el' && it.node === this.state.root();
    const msgMode = this.state.msgMode();

    const isValueBox =
      it.kind === 'el'
        ? !n.synthetic && this.tree.isLeaf(n)
        : this.tree.isLeaf(this.tree.ctxNode(it.parentNode, it.ausp.id));

    const pe = this.state.elemente()[path] ?? {};
    const ausps = it.kind === 'el' ? this.state.auspsOf(path) : null;
    const sel = this.state.selItem();
    const { text: kardText, standard: standardHint } = this.state.kardAnzeige({
      kind: it.kind,
      node: n,
      path,
    });
    const rk = refKindOf(n);
    const stationArt = this.state.guided() && !readOnly ? this.guided.stationArt(path) : null;
    const wert = this.wertfelder(it, n, path, isValueBox, readOnly);

    // Vorkommen anlegen/entfernen (Buttons ⧉ und ✕) — nur wo sie erscheinen,
    // wird die Kardinalitaets-Sperre ermittelt (Baumweg-Suche je Knoten).
    const zeigtDelAusp = !readOnly && !isRoot && it.kind === 'ausp';
    const zeigtDup =
      !readOnly &&
      !isRoot &&
      !n.erweiterung &&
      (it.kind === 'ausp' || (!n.synthetic && this.tree.isRepeatable(n)));

    // Belegte Angaben hervorheben: beim Befuellen einer Testnachricht ist die
    // erste Frage, wo schon etwas steht. Das Eingabefeld allein beantwortet sie
    // nicht — ein Platzhalter sieht einem Wert zu aehnlich, und ein zugeklappter
    // Ast zeigt gar nichts.
    const hervor = this.state.wertHervorhebung() && !this.state.entfaellt(path);
    const belegtSub = hervor ? this.state.belegtImAst(path) : 0;

    const diff = this.diffLage(it, path);

    return {
      kind: it.kind,
      auspBox: it.kind === 'ausp',
      extBox: !!n.erweiterung,
      title: it.kind === 'ausp' ? it.ausp.name : pretty(n.name),
      mini: this.mini(path, sel),
      selected: sel ? itemPath(sel) === path : false,
      excluded: isExcl,
      exclInherit: !isExcl && inhExcl,
      leafBox: isValueBox,
      parentBox: !isValueBox,
      isValueBox,
      belegt: hervor && this.state.hatTestwert(path),
      belegtSub: belegtSub || null,
      // Im Durchlauf gewinnt die Farbe der Station: sie sagt, was die Nachricht
      // verlangt — und bleibt anders als die Kennzeichen auch im Mini-Kasten
      // sichtbar. Sonst wie bisher die Farbe der gesetzten Statusstufe.
      statusStrip:
        stationArt === 'pflicht'
          ? '#1D9E75'
          : stationArt === 'frei'
            ? '#BA7517'
            : st
              ? st.farbe
              : null,
      statusName: msgMode ? (isExcl ? 'entfernt' : '') : (st?.name ?? ''),
      kardText,
      kardColor: st ? st.farbe : 'var(--muted)',
      standardHint,
      doc: it.kind === 'el' ? (n.doc ? n.doc.split('\n')[0]! : null) : pe.anmerkung || null,
      showTech: this.state.showTech() && it.kind === 'el',
      techText: it.kind === 'el' ? n.name + (n.typeName ? ' : ' + n.typeName : '') : '',
      refkind: rk,
      refziel: pe.refZiel ?? null,
      ...wert,
      kennzeichen: this.kennzeichen(it, n, path, {
        isValueBox,
        rk,
        ausps,
        gesperrt,
        readOnly,
        stationArt,
        diffTags: diff.tags,
      }),
      dfR: diff.dfR,
      dfA: diff.dfA,
      valErr: diff.valErr,
      showHide: !readOnly && !isRoot && it.kind === 'el' && !n.erweiterung,
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
  }

  // ── Bausteine ───────────────────────────────────────────────────────

  /** Der fuer Anzeige/Werte massgebliche Knoten (Element bzw. Traeger des Vorkommens). */
  private knoten(it: TreeItem): TreeNode {
    return it.kind === 'el' ? it.node : it.parentNode;
  }

  /** Pfad ohne Vorkommen und ohne Nachrichtennamen — die Adresse im Diff. */
  private relativerPfad(path: string): string {
    return path.replace(/@[^/]+/g, '').slice((this.state.msgName() || '').length);
  }

  /** Fokus-Modus (Z.1216-1227): alles abseits des gewaehlten Astes wird klein. */
  private mini(path: string, sel: TreeItem | null): boolean {
    if (!this.state.focusMode() || !sel) return false;
    const sp = itemPath(sel);
    let isChild = false;
    if (path.startsWith(sp)) {
      const rest = path.slice(sp.length);
      isChild =
        (rest.startsWith('/') && !rest.slice(1).includes('/') && !rest.slice(1).includes('@')) ||
        (rest.startsWith('@') && !rest.includes('/'));
    }
    return !unterPfad(sp, path) && !isChild;
  }

  /** Wertanzeige, Eingabefeld, Werteliste und die Nur-Lesen-Zeile (Z.1243-1257). */
  private wertfelder(
    it: TreeItem,
    n: TreeNode,
    path: string,
    isValueBox: boolean,
    readOnly: boolean,
  ): Pick<Kastenansicht, 'mv' | 'vin' | 'roVal' | 'datalist'> {
    if (!isValueBox) return { mv: null, vin: null, roVal: null, datalist: null };
    // Nachrichten-Ueberlagerung: der Wert steht in den Kaesten der einzelnen
    // Nachrichten, nicht am Blatt. Ein Platzhalter waere hier das Gegenteil
    // einer Aussage — er saehe aus wie ein Wert, den es nicht gibt.
    if (this.ueberlagerung.aktiv()) return { mv: null, vin: null, roVal: null, datalist: null };
    const pe = this.state.elemente()[path] ?? {};
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
    const mv: Wertanzeige = {
      text: pe.beispiel ? (wertLabel ? pe.beispiel + ' · ' + wertLabel : pe.beispiel) : auto,
      ghost: !pe.beispiel,
      // Im Mini-Kasten ist der Platz knapp — der volle Text steht im Tooltip.
      title: wertLabel ? pe.beispiel + ' · ' + wertLabel : null,
    };

    // Betrachtungsmodus: Wert nur anzeigen, kein editierbares Eingabefeld.
    // Belegte Blaetter bekommen eine read-only Wertezeile; Codes werden dabei
    // zu ihrem Klartext aufgeloest (Story 4).
    if (readOnly)
      return {
        mv,
        vin: null,
        datalist: null,
        roVal: pe.beispiel
          ? {
              value: pe.beispiel,
              label: n.codelist ? this.values.labelFor(n.codelist, pe.beispiel) : null,
            }
          : null,
      };

    const listId = 'dl' + n.id + '_' + (it.kind === 'ausp' ? it.ausp.id : 'e');
    const werte = n.codelist ? this.values.clWerte(n.codelist) || [] : [];
    let datalist: { id: string; options: EnumWert[] } | null = null;
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
    return {
      mv,
      datalist,
      roVal: null,
      vin: {
        value: pe.beispiel || '',
        placeholder: auto,
        listId: datalist ? listId : null,
        // Typwidrige Testwerte sichtbar machen (Pattern-/Builtin-/Codelisten-Pruefung).
        problem: pe.beispiel
          ? this.values.wertProblem(
              { name: n.name, path, typeName: n.typeName, codelist: n.codelist },
              pe.beispiel,
            )
          : null,
        label: wertLabel,
      },
    };
  }

  /**
   * Diff- und Validierungslage des Kastens: die Kennzeichen dazu und die drei
   * Flags, die den Rahmen faerben.
   */
  private diffLage(
    it: TreeItem,
    path: string,
  ): { tags: Kennzeichen[]; dfR: boolean; dfA: boolean; valErr: boolean } {
    const tags: Kennzeichen[] = [];
    let dfR = false;
    let dfA = false;
    let valErr = false;

    // Diff-Markierungen (Z.1290-1312).
    const diffMap = this.state.diffMap();
    if (this.state.showDiff() && diffMap && it.kind === 'el') {
      const rel = this.relativerPfad(path);
      const vB = this.state.idxB()?.version || 'neu';
      let ownArt: string | null = null;
      if (!it.node.synthetic && it.node !== this.state.root()) {
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
    return { tags, dfR, dfA, valErr };
  }

  /** Der Kennzeichen-Katalog des Kastens (Z.1270-1313). */
  private kennzeichen(
    it: TreeItem,
    n: TreeNode,
    path: string,
    ctx: {
      isValueBox: boolean;
      rk: string | null;
      ausps: Auspraegung[] | null;
      gesperrt: boolean;
      readOnly: boolean;
      stationArt: string | null;
      diffTags: Kennzeichen[];
    },
  ): Kennzeichen[] {
    const { isValueBox, rk, ausps, gesperrt, readOnly, stationArt } = ctx;
    const pe = this.state.elemente()[path] ?? {};
    const tags: Kennzeichen[] = [];

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
      else if (isValueBox && !rk) tags.push({ cls: 't-wert', text: 'Wert: ' + this.wertart(n) });
      if (n.recursive) tags.push({ cls: 't-rec', text: 'rekursiv' });
      if (ausps && ausps.length) tags.push({ cls: 't-ausp', text: ausps.length + ' Ausprägungen' });
    } else if (isValueBox && !rk) {
      tags.push(
        n.codelist
          ? { cls: 't-code', text: 'Codeliste' }
          : { cls: 't-wert', text: 'Wert: ' + this.wertart(n) },
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
      tags.push({ cls: 't-lock', text: 'Profil: nicht verwendet', title: this.sperrGrund(path) });

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

    return [...tags, ...ctx.diffTags];
  }

  /**
   * Warum die gebundene Fassung diesen Kasten sperrt — derselbe Wortlaut wie im
   * Detailbereich (`core/ansicht/sperrgrund.ts`).
   */
  sperrGrund(path: string): string {
    return sperrGrundText(
      this.state.vorgabeSchliesstAus(path),
      this.state.statusOf(path)?.name,
      this.state.anmerkungOf(path),
    );
  }

  /** valueKind (Parser, schema-abhaengig). */
  private wertart(n: TreeNode): string {
    const idx = this.state.idx();
    return idx ? this.parser.valueKind(n, idx) : 'Wert';
  }
}
