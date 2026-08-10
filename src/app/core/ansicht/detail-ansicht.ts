import { Injectable, inject } from '@angular/core';
import { StateService } from '../services/state.service';
import { TreeService } from '../services/tree.service';
import { ValueService } from '../services/value.service';
import { GuidedService } from '../services/guided.service';
import { HinweisStoreService } from '../services/hinweis-store.service';
import { itemPath } from '../../models/node.model';
import { fmtKard, kardText, pretty } from '../util/pretty.util';
import { erwTypFehltText } from '../util/erweiterung.util';
import { REF_LABELS, refKindEff, refKindOf, refTraeger } from '../refs';
import { sperrGrundText } from './sperrgrund';

/**
 * Die Anzeige-Ableitung des Detailbereichs — das Gegenstueck zur
 * `BaumkastenAnsicht` fuer den ausgewaehlten Punkt (Profilierer.html
 * Z.1506-1666: Status, Kardinalitaet, Vorkommen, Codelisten-Werte, Verweisziel,
 * Anmerkung, Beispielwert).
 *
 * Warum ein eigenes Modul: die Ableitung lag als 178-Zeilen-`computed` in einer
 * Komponente mit 13 Abhaengigkeiten und war nur ueber das gerenderte Panel
 * pruefbar. Fachliche Entscheidungen — wo der Verweis haengt (#30), wann
 * Unterelemente moeglich sind (#97), wann die Werte-Eingabe hart gesperrt ist,
 * was die gebundene Fassung vorschlaegt — sind keine Darstellungsfragen.
 *
 * `null` bedeutet: nichts ausgewaehlt, das Panel zeigt seinen Ruhezustand.
 */
@Injectable({ providedIn: 'root' })
export class DetailAnsicht {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly values = inject(ValueService);
  private readonly guided = inject(GuidedService);
  private readonly hinweise = inject(HinweisStoreService);

  /** Das Anzeige-Modell des ausgewaehlten Punkts (null = keine Auswahl). */
  punkt() {
    const it = this.state.selItem();
    if (!it) return null;
    const isAusp = it.kind === 'ausp';
    const n = isAusp ? it.parentNode : it.node;
    const path = itemPath(it);
    const p = this.state.elemente()[path] ?? {};
    const st = this.state.statusOf(path);

    const statusButtons = [
      { id: '', name: 'wie Standard', farbe: 'var(--accent)', active: !st },
      ...this.state.statuses().map((s) => ({
        id: s.id,
        name: s.name,
        farbe: s.farbe,
        active: !!st && st.id === s.id,
      })),
    ];

    const kmin = isAusp ? '1' : n.min;
    const kmax = isAusp ? '1' : n.max === 'unbounded' ? '*' : n.max;

    const showAusps = !isAusp && this.tree.isRepeatable(n) && !n.synthetic;
    // Je Vorkommen der Grund, warum es nicht entfernbar ist (zwingend gesetzt,
    // #28) — null, solange es entfernbar ist. Getrennt von der Anzahl-Sperre,
    // die fuer die ganze Liste gilt.
    const auspList = showAusps
      ? (this.state.auspsOf(path) ?? []).map((a) => ({
          ...a,
          sperre: this.guided.auspSperreEntfernen(path, a.id),
        }))
      : [];
    // Gebundener Durchlauf: waehlbare Quellen fuer ein weiteres Vorkommen —
    // null, wo Vorkommen frei angelegt werden duerfen (#28).
    const auspKopieKandidaten = showAusps ? this.guided.auspKopieKandidaten(path) : null;

    // Blatt-Eigenschaft des ausgewaehlten Items (Ausprägung: ihr Kontext-Knoten).
    const leaf = isAusp
      ? this.tree.isLeaf(this.tree.ctxNode(it.parentNode, it.ausp.id))
      : this.tree.isLeaf(n);

    // Codeliste — der Regel-Anteil (effektive Einschraenkung, synthetischer
    // Ausweg, Drift-Erkennung) liegt im ValueService und ist dort direkt
    // getestet; das Panel komponiert nur noch.
    const codelist =
      n.codelist && (!isAusp || this.tree.isLeaf(n))
        ? this.values.codelistenSicht(n.codelist, path, this.state.msgMode())
        : null;

    // Verweisziel.
    let ref: null | {
      label: string;
      options: { path: string; label: string; selected: boolean }[];
      cur: string;
      curLabel: string;
      /** Pfad des Traegers — dort haengt das Verweisziel (#30). */
      pfad: string;
      /** Grenzt die Profilierung die Auswahl ein? (Hinweis am Punkt) */
      beschraenkt: boolean;
    } = null;
    // Der Verweis haengt am Traeger, nicht am Nummern-Blatt darunter: im
    // gefuehrten Durchlauf faellt die Entscheidung am Blatt, die Zielangabe
    // gehoert trotzdem an den Traeger (#30).
    const refNode = refTraeger(n) ?? (refKindOf(n) ? n : null);
    const rk = refNode ? refKindEff(refNode) : null;
    if (refNode && rk) {
      const refPfad = refNode.path;
      const kand = this.guided.verweisZiele(refPfad);
      const cur = this.state.refZielOf(refPfad) || '';
      const options = [{ path: '', label: '— kein Ziel festgelegt —', selected: !cur }];
      let curFound = false;
      for (const k of kand) {
        if (k.path === cur) curFound = true;
        options.push({ path: k.path, label: k.label, selected: k.path === cur });
      }
      if (cur && !curFound)
        options.push({ path: cur, label: this.state.auspLabel(cur), selected: true });
      const curLabel = options.find((o) => o.selected)?.label ?? '— kein Ziel festgelegt —';
      ref = {
        label: REF_LABELS[rk] || rk,
        options,
        cur,
        curLabel,
        pfad: refPfad,
        beschraenkt: !!this.state.vorgabeRefZiel(refPfad),
      };
    }

    // Schema-Erweiterung: Eigenschaften direkt editierbar (US Schema-Erweiterung).
    const e = !isAusp ? (it.node.erweiterung ?? null) : null;
    // Der im aktiven Schema fehlende Typ (#97): rote Warnung statt stiller
    // Blattdarstellung — die Profilierung darunter bleibt gespeichert.
    const typFehlt = !isAusp ? this.tree.erwTypFehlt(it.node) : null;
    const erw = e
      ? {
          name: e.name,
          beschreibung: e.beschreibung ?? '',
          min: e.min,
          max: e.max,
          typ: { datentyp: e.datentyp, datentypQuelle: e.datentypQuelle },
          // Unterelemente stehen ueberall dort an, wo der Knoten kein Blatt ist —
          // dieselbe Regel wie im Baum: Container und typisierte Struktur ja,
          // Wert- und Codelisten-Typ nein. Ein rekursiver Knoten ist zwar kein
          // Blatt, rendert seinen Unterbau aber nicht (`abstiegsKinder` bricht
          // ab) — dort angelegte Erweiterungen waeren unsichtbare Profildaten.
          kannUnterelement: !isAusp && !it.node.recursive && !this.tree.isLeaf(it.node),
          typFehlt: typFehlt ? erwTypFehltText(typFehlt, this.state.idx()?.version) : '',
        }
      : null;

    // Gebundener Durchlauf: was die Profilierung ausschliesst, ist gesperrt —
    // kein Entscheidungspunkt, kein Eingabefeld, aber mit Begruendung sichtbar
    // (US "Testnachricht aus einer Profilierung").
    const gesperrt = this.state.vorgabeGesperrt(path);

    // Vorschlag der gebundenen Fassung (Beispielwert bzw. einziger freigegebener
    // Codelisten-Wert): angeboten, nicht gesetzt. Deckt sich der aktuelle Wert
    // schon mit ihm, gibt es nichts mehr zu uebernehmen.
    const vorschlagRoh = this.state.msgMode() && leaf ? this.values.vorschlagFor(path) : null;
    const vorschlag = vorschlagRoh && vorschlagRoh !== (p.beispiel ?? '') ? vorschlagRoh : '';

    return {
      isAusp,
      erw,
      istErweiterung: !!n.erweiterung,
      gesperrt,
      sperrGrund: gesperrt ? this.sperrGrund(path, st?.name) : '',
      auspName: isAusp ? it.ausp.name : '',
      parentName: n.name,
      title: pretty(n.name),
      sub: n.erweiterung
        ? n.name + (n.typeName ? ' : ' + n.typeName : ' (Container)') + ' · Schema-Erweiterung'
        : n.name +
          (n.typeName ? ' : ' + n.typeName : '') +
          ' · Standard: ' +
          kardText(n.min, n.max),
      subKard: fmtKard(n.min, n.max),
      doc: !isAusp ? n.doc : '',
      statusButtons,
      /** Nachrichten-Modus: Angabe ist aus der Nachricht entfernt (Ausschluss). */
      entfernt: st?.wirkung === 'ausgeschlossen',
      kminPlaceholder: kmin,
      kmaxPlaceholder: kmax,
      minValue: p.min ?? '',
      maxValue: p.max ?? '',
      kardHint: isAusp ? 'genau 1' : 'Standard',
      showAusps,
      auspList,
      auspKopieKandidaten,
      // Kardinalitaet des Durchlaufs: Grund der Sperre bzw. null (Issue #27).
      kardHinzuSperre: showAusps ? this.guided.kardSperreHinzu(path) : null,
      kardEntfernenSperre: showAusps ? this.guided.kardSperreEntfernen(path) : null,
      leaf,
      codelist,
      vorschlag,
      // Harte Codelisten-Einschraenkung: im Nachrichten-Modus sind ausschliesslich
      // die freigegebenen Werte auswaehlbar, die freie Eingabe ist gesperrt.
      wertGesperrt: this.state.msgMode() && !!codelist?.restricted,
      ref,
      // Nummern-Blatt eines Verweises im Nachrichten-Modus: den Wert vergibt das
      // Werkzeug aus der Zielwahl, die freie Eingabe entfaellt (#30).
      refNummer: this.state.msgMode() && leaf && /^ref\./.test(n.name),
      anmerkung: p.anmerkung ?? '',
      // Hinweise sind eine eigene Ressource (ADR 0014) und kommen nicht aus `p`.
      hinweise: this.hinweise.jePfad().get(path) ?? [],
      beispiel: p.beispiel ?? '',
      // Klartext hinter dem belegten Code (Story 4) — null, wenn kein Code-Feld
      // oder Liste (noch) nicht geladen.
      beispielLabel: n.codelist ? this.values.labelFor(n.codelist, p.beispiel) : null,
      // Typwidrige Beispielwerte sichtbar machen (Pattern-/Builtin-/Codelisten-Pruefung).
      beispielProblem: p.beispiel
        ? this.values.wertProblem(
            { name: n.name, path, typeName: n.typeName, codelist: n.codelist },
            p.beispiel,
          )
        : null,
      curStatusName: st?.name ?? 'wie Standard',
    };
  }

  /**
   * Begruendung der Sperre: eigener Ausschluss der gebundenen Fassung (mit dem
   * Namen der Statusstufe) oder Vererbung aus einem ausgeschlossenen Vorfahren;
   * die fachliche Anmerkung des Profils kommt als Begruendung dazu. Derselbe
   * Wortlaut traegt das Sperr-Kennzeichen im Baum.
   */
  private sperrGrund(path: string, statusName?: string): string {
    return sperrGrundText(
      this.state.vorgabeSchliesstAus(path),
      statusName,
      this.state.anmerkungOf(path),
    );
  }
}
