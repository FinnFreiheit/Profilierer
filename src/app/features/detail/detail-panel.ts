import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { TreeService } from '../../core/services/tree.service';
import { ValueService, WerteModus } from '../../core/services/value.service';
import { NavService } from '../../core/services/nav.service';
import { GuidedService } from '../../core/services/guided.service';
import { DispositionService } from '../../core/services/disposition.service';
import { CodelistService } from '../../core/services/codelist.service';
import { ToastService } from '../../core/services/toast.service';
import { ErweiterungDialogService } from '../../core/services/erweiterung-dialog.service';
import { HinweisStoreService } from '../../core/services/hinweis-store.service';
import { LoggerService } from '../../core/services/logger.service';
import { itemPath } from '../../models/node.model';
import { fmtKard, kardText, pretty } from '../../core/util/pretty.util';
import { hinweisFehlerText, hinweisHerkunft } from '../../core/util/hinweis.util';
import { Hinweis } from '../../models/profile.model';
import { ERW_DATENTYPEN, ERW_NAME_MUSTER } from '../../core/profile-defaults';
import { REF_LABELS, refKindEff, refKindOf, refTraeger } from '../../core/refs';

/**
 * Detailbereich (Profilierer.html Z.1506-1666): Status, Kardinalitaet,
 * Ausprägungen, Codelisten-Werte, Verweisziel, Anmerkung, Beispielwert.
 */
@Component({
  selector: 'app-detail-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detail-panel.html',
})
export class DetailPanel {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly values = inject(ValueService);
  private readonly nav = inject(NavService);
  private readonly guided = inject(GuidedService);
  private readonly disposition = inject(DispositionService);
  private readonly codelistSvc = inject(CodelistService);
  private readonly toast = inject(ToastService);
  private readonly erwDialog = inject(ErweiterungDialogService);
  protected readonly hinweise = inject(HinweisStoreService);
  private readonly log = inject(LoggerService);

  /**
   * Eingabefeld „Hinweis hinzufuegen". Wie der Codelisten-Filter beim Wechsel
   * des selektierten Elements geleert — sonst wanderte ein angefangener Text
   * mit und landete beim naechsten Blur am falschen Element.
   */
  protected readonly neuerHinweis = linkedSignal({
    source: () => {
      const it = this.state.selItem();
      return it ? itemPath(it) : '';
    },
    computation: () => '',
  });

  /**
   * Filtertext der Codelisten-Werte. Wird beim Wechsel des selektierten Elements
   * geleert — sonst filtert ein alter Suchtext unsichtbar weiter, wenn die neue
   * Liste kein Filterfeld zeigt (≤ 15 Werte), und die Werte-Liste bleibt leer.
   */
  protected readonly clFilter = linkedSignal({
    source: () => {
      const it = this.state.selItem();
      return it ? itemPath(it) : '';
    },
    computation: () => '',
  });
  /**
   * Alle Werte ausgeschlossen (`werte: []`) — dann ist „alle zeigen" erzwungen,
   * sonst bliebe eine leere Liste ohne Ausweg. Bewusst aus `state.elemente()`
   * abgeleitet und nicht aus `clSicht()`: die Sicht liest `clAlle`, ein Blick
   * zurueck waere ein Zyklus.
   */
  private readonly clErzwungen = computed(() => {
    const it = this.state.selItem();
    if (!it) return false;
    const werte = this.state.werteOf(itemPath(it));
    return !!werte && !werte.length;
  });
  /**
   * Umschalter „alle zeigen" der eingeschraenkten Werteliste. Wie der Textfilter
   * beim Elementwechsel zurueckgesetzt — sonst wanderte ein unsichtbarer
   * Ansichtszustand mit (US "Werteliste zeigt, was gilt"). Der Zwang bei „keine"
   * schreibt den Zustand und haelt ihn ueber den Wegfall des Zwangs hinaus,
   * damit die Liste beim ersten Haken nicht zusammenklappt
   * (`ValueService.naechsterUmschalter`).
   */
  protected readonly clAlle = linkedSignal<{ path: string; erzwungen: boolean }, boolean>({
    source: () => {
      const it = this.state.selItem();
      return { path: it ? itemPath(it) : '', erzwungen: this.clErzwungen() };
    },
    computation: (quelle, vorher) =>
      this.values.naechsterUmschalter(
        vorher && vorher.source.path === quelle.path ? vorher.value : null,
        quelle.erzwungen,
      ),
  });
  protected readonly erwDatentypen = ERW_DATENTYPEN;
  /** Pfad, fuer den im Datentyp-Select "Sonstiger…" gewaehlt wurde (noch ohne Freitext). */
  private readonly erwSonstig = signal<string | null>(null);

  /** Eingabefeld „Hinweis hinzufuegen" — Fokusziel der Entscheidung „zu klären" (#41). */
  private readonly hinweisFeld = viewChild<ElementRef<HTMLTextAreaElement>>('hinweisFeld');

  /** Betrachtungsmodus: Editier-Controls werden im Template ausgeblendet. */
  protected readonly ro = this.state.readOnly;

  /**
   * Betrachtungsmodus des ausgewaehlten Punkts: global schreibgeschuetzt **oder**
   * von der gebundenen Profilfassung ausgeschlossen. Gesperrtes traegt keine
   * Bedienelemente, sondern nur die Lese-Ansicht — das Template gattert daran
   * statt an `ro()`, sonst blieben Wert, Anmerkung, Vorkommen, Codelisten-Auswahl
   * und Verweisziel an einem ausgeschlossenen Element bedienbar.
   */
  protected readonly roEff = computed(() => this.ro() || !!this.vm()?.gesperrt);

  /** Nachrichten-Modus: eine Instanz wird erstellt oder bearbeitet (Werte statt Profil). */
  protected readonly msgMode = this.state.msgMode;

  /** Gefuehrte Testnachricht-Erstellung (US "Testnachricht gefuehrt erstellen"). */
  protected readonly isCreate = this.state.isMessageCreate;

  protected readonly vm = computed(() => {
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

    // Codeliste.
    let codelist: null | {
      nameLang: string;
      kennung: string;
      geladen: boolean;
      version: string | null;
      eff:
        | { value: string; label: string; checked: boolean; belegt: boolean; search: string }[]
        | null;
      restricted: boolean;
      werte: string[] | null;
      allowedCount: number;
      /**
       * Zahl der freigegebenen Codes, die in den anzeigbaren Zeilen tatsaechlich
       * vorkommen. 0 bei gesetzter Einschraenkung heisst: die geladene Liste
       * fuehrt keinen der freigegebenen Codes (Versionsdrift, Tippfehler) — der
       * Hinweis darf dann nicht auf eine Liste verweisen, die nichts anbietet.
       */
      allowedSichtbar: number;
      total: number;
      showFilter: boolean;
      manualText: string;
    } = null;
    if (n.codelist && (!isAusp || this.tree.isLeaf(n))) {
      const cl = n.codelist;
      const geladeneWerte = this.values.clWerte(cl);
      const geladen = !(cl.werte && cl.werte.length) && !!geladeneWerte;
      // Effektive Einschraenkung: im gebundenen Durchlauf steht sie in der
      // Vorgabe (und gilt dort auch im Vorkommen), beim Profilieren im eigenen
      // Eintrag. Zum Abgleich zaehlt der reine Code — die Eintraege duerfen aus
      // dem Freitextfeld stammen („2001 — Genehmigung …").
      const werte = this.state.werteOf(path);
      const codes = werte ? this.values.werteZeilen(werte).map((w) => w.value) : null;
      // Ohne geladene Liste bleiben die freigegebenen Eintraege die einzige
      // Auswahl — sonst stuende im Nachrichten-Modus eine harte Einschraenkung
      // ohne auswaehlbare Werte da.
      const eff =
        geladeneWerte ?? (this.msgMode() && codes?.length ? this.values.werteZeilen(werte!) : null);
      const allowed = new Set(codes ?? []);
      const belegterCode = p.beispiel ?? '';
      codelist = {
        nameLang: cl.nameLang,
        kennung: cl.kennung,
        geladen,
        version: this.values.clVersion(cl),
        eff: eff
          ? eff.map((w) => ({
              value: w.value,
              label: w.label,
              checked: !codes || allowed.has(w.value),
              belegt: !!belegterCode && w.value === belegterCode,
              search: (w.value + ' ' + w.label).toLowerCase(),
            }))
          : null,
        restricted: !!werte,
        werte: codes,
        allowedCount: allowed.size,
        allowedSichtbar: eff ? eff.filter((w) => allowed.has(w.value)).length : 0,
        // Bezugsgroesse „x von y" ist die geladene Liste; sind die Zeilen aus den
        // freigegebenen Eintraegen synthetisiert, gibt es kein y (0 = nicht zeigen).
        total: geladeneWerte ? geladeneWerte.length : 0,
        showFilter: !!eff && eff.length > 15,
        manualText: (p.werte ?? []).join('\n'),
      };
    }

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
    const erw = e
      ? {
          name: e.name,
          beschreibung: e.beschreibung ?? '',
          min: e.min,
          max: e.max,
          typWahl:
            this.erwSonstig() === path
              ? 'sonstig'
              : !e.datentyp
                ? 'container'
                : ERW_DATENTYPEN.includes(e.datentyp)
                  ? e.datentyp
                  : 'sonstig',
          typFrei: e.datentyp && !ERW_DATENTYPEN.includes(e.datentyp) ? e.datentyp : '',
          container: !e.datentyp,
        }
      : null;

    // Gebundener Durchlauf: was die Profilierung ausschliesst, ist gesperrt —
    // kein Entscheidungspunkt, kein Eingabefeld, aber mit Begruendung sichtbar
    // (US "Testnachricht aus einer Profilierung").
    const gesperrt = this.state.vorgabeGesperrt(path);

    // Vorschlag der gebundenen Fassung (Beispielwert bzw. einziger freigegebener
    // Codelisten-Wert): angeboten, nicht gesetzt. Deckt sich der aktuelle Wert
    // schon mit ihm, gibt es nichts mehr zu uebernehmen.
    const vorschlagRoh = this.msgMode() && leaf ? this.values.vorschlagFor(path) : null;
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
      wertGesperrt: this.msgMode() && !!codelist?.restricted,
      ref,
      // Nummern-Blatt eines Verweises im Nachrichten-Modus: den Wert vergibt das
      // Werkzeug aus der Zielwahl, die freie Eingabe entfaellt (#30).
      refNummer: this.msgMode() && leaf && /^ref\./.test(n.name),
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
  });

  /**
   * Begruendung der Sperre: eigener Ausschluss der gebundenen Fassung (mit dem
   * Namen der Statusstufe) oder Vererbung aus einem ausgeschlossenen Vorfahren;
   * die fachliche Anmerkung des Profils kommt als Begruendung dazu.
   */
  private sperrGrund(path: string, statusName?: string): string {
    const eigen = this.state.vorgabeSchliesstAus(path);
    const kern = eigen
      ? `Die gebundene Profilierung setzt dieses Element auf „${statusName || 'nicht verwendet'}" — es ist nicht befüllbar und erscheint nicht in der Testnachricht.`
      : 'Ein übergeordnetes Element ist in der gebundenen Profilierung ausgeschlossen — der Teilbaum entfällt.';
    const anm = this.state.anmerkungOf(path);
    return anm ? `${kern}\nBegründung aus der Profilierung: ${anm}` : kern;
  }

  /**
   * Gefuehrte Entscheidung (US "Profilierung gefuehrt erstellen"): Dispositions-
   * Buttons an der Wirkung, Auswahl-Schritt fuer choice-Gruppen, wiederverwendbare
   * Freitexte und Spur-Navigation. Nur im gefuehrten Modus (nicht read-only).
   */
  protected readonly gv = computed(() => {
    if (!this.state.guided() || this.state.readOnly()) return null;
    if (this.guided.instanzModus()) return null; // Instanz-Fuehrung uebernimmt giv()
    const it = this.state.selItem();
    if (!it) return null;
    const path = itemPath(it);
    const cur = this.state.elemente()[path]?.status ?? null;

    // Vier feste Dispositionen, an die Wirkung gebunden (Fallback: disabled,
    // wenn die Profilierung keine Stufe mit passender Wirkung konfiguriert hat).
    // Die vierte parkt den Punkt sichtbar, statt ihn offen zu lassen (#41).
    const dispo = [
      { st: this.state.pflichtStatus(), fallback: 'zwingend', taste: 'z' },
      { st: this.state.optionalStatus(), fallback: 'anzugeben, wenn vorhanden', taste: 'o' },
      { st: this.state.exclStatus(), fallback: 'nicht verwendet', taste: 'n' },
      { st: this.state.markierungStatus(), fallback: 'zu klären', taste: 'k' },
    ].map((d) => ({
      id: d.st?.id ?? '',
      label: d.st?.name ?? d.fallback,
      farbe: d.st?.farbe ?? 'var(--muted)',
      active: !!d.st && cur === d.st.id,
      disabled: !d.st,
      taste: d.taste,
      /** „Zu klären": setzt den Status und stellt den Cursor ins Hinweisfeld (#41). */
      markierung: d.st?.wirkung === 'markierung',
    }));

    // Auswahl-Schritt: zulaessige Alternativen einschraenken — sowohl fuer
    // synthetische choice-Gruppen als auch fuer den XJustiz-Normalfall
    // benannter auswahl_*-Elemente (Element mit choice-Inhalt; model steht
    // erst nach expandNode fest).
    let isChoice = false;
    let synthChoice = false;
    let zweige: { path: string; label: string; zulaessig: boolean }[] | null = null;
    let minChoice = '1';
    if (it.kind === 'el' && !it.node.recursive && !this.tree.isLeaf(it.node)) {
      this.tree.expandNode(it.node);
      isChoice = it.node.model === 'choice';
      synthChoice = isChoice && it.node.synthetic;
      if (isChoice) {
        minChoice = it.node.min;
        zweige = (it.node.children ?? []).map((c) => ({
          path: c.path,
          label: c.synthetic ? c.name : pretty(c.name),
          zulaessig: this.state.wirkungOf(c.path) !== 'ausgeschlossen',
        }));
      }
    }

    const offene = this.guided.offeneSet();
    const anm = this.state.elemente()[path]?.anmerkung?.trim() ?? '';
    return {
      path,
      offen: offene.has(path),
      nOffen: offene.size,
      /** Punkt geparkt („zu klären", #41) — weder offen noch entschieden. */
      geparkt: this.guided.geparkteSet().has(path),
      dispo,
      isChoice,
      synthChoice,
      minChoice,
      zweige,
      bestaetigt: isChoice ? this.guided.istEntschieden(path) : false,
      // Eigenen aktuellen Text nicht als Vorschlag anbieten.
      vorschlaege: this.guided.anmerkungVorschlaege().filter((t) => t !== anm),
    };
  });

  /**
   * Gefuehrte Instanz-Entscheidung (US "Testnachricht gefuehrt erstellen"):
   * aufnehmen/weglassen fuer Optionales, genau EIN Zweig je Auswahl,
   * Pflichtwert-Hinweis fuer Blaetter und die Spur-Navigation.
   */
  protected readonly giv = computed(() => {
    if (!this.state.guided() || this.state.readOnly()) return null;
    if (!this.state.messageCreate()) return null;
    const it = this.state.selItem();
    if (!it) return null;
    const path = itemPath(it);
    // Von der gebundenen Profilierung Ausgeschlossenes ist kein Entscheidungspunkt.
    if (this.state.vorgabeGesperrt(path)) return null;
    const punkt = this.guided.punktAt(path);
    const offene = this.guided.offeneSet();
    const w = this.state.wirkungOf(path);

    // Zweige des Auswahl-Schritts (Entweder-oder).
    let zweige: { path: string; label: string; gewaehlt: boolean; sperre: string | null }[] | null =
      null;
    if (punkt?.art === 'auswahl') {
      const node = it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
      this.tree.expandNode(node);
      zweige = (node.children ?? []).map((c) => ({
        path: c.path,
        label: c.synthetic ? c.name : pretty(c.name),
        gewaehlt: this.state.wirkungOf(c.path) === 'pflicht',
        // Umschalten wuerde einen Zweig ausschliessen, den die Profilierung mit
        // einer Mindestanzahl verlangt (Issue #50) — der Radio-Knopf ist dann
        // gesperrt und nennt den Grund, statt die Sperre still zu umgehen.
        sperre: this.guided.kardSperreZweigwechsel(path, c.path),
      }));
    }

    const wertOffen =
      (punkt?.art === 'wert' ||
        ((punkt?.art === 'element' || punkt?.art === 'auspraegung') &&
          punkt.leaf &&
          w === 'pflicht')) &&
      !this.guided.wertOk(path);

    return {
      art: punkt?.art ?? null,
      istPunkt: !!punkt,
      offen: offene.has(path),
      nOffen: offene.size,
      aufgenommen: w === 'pflicht',
      weggelassen: w === 'ausgeschlossen',
      entfaellt: !w && this.state.inheritedExcluded(path),
      zweige,
      wertOffen,
      // Gebundener Durchlauf: was die Profilierung festlegt bzw. offen laesst.
      zwingend: this.state.profilWirkungGeerbt(path) === 'pflicht',
      // Grund, warum das Element nicht weggelassen werden darf (Mindestanzahl
      // der Profilierung, Issue #50) — null, solange es abwaehlbar ist.
      weglassSperre: this.guided.kardSperreWeglassen(path),
      marker: this.guided.markerOf(path),
      // Anmerkung der Profilierung als Hilfetext am Entscheidungspunkt: sie ist
      // oft die Begruendung, warum das Feld so aussehen muss. Bewusst
      // `vorgabeAnmerkung` und nicht `anmerkungOf` — letzteres zieht die
      // Entscheidung vor und zeigte, sobald der Durchlauf eigene Anmerkungen
      // fuehren darf, eine eigene Notiz als „Anmerkung der Profilierung".
      hilfetext: this.state.hatVorgabe() ? (this.state.vorgabeAnmerkung(path) ?? '') : '',
    };
  });

  /**
   * Sichtbarkeitsregel der eingeschraenkten Werteliste (ValueService) samt
   * Umschalter-Zustand — das Panel entscheidet nur noch ueber den Modus.
   */
  protected readonly clSicht = computed(() => {
    const cl = this.vm()?.codelist;
    const modus: WerteModus = this.roEff() ? 'lesen' : this.msgMode() ? 'nachricht' : 'profil';
    return this.values.sichtbareWerte(cl?.eff ?? null, cl?.werte, this.clAlle(), modus);
  });

  /** Codelisten-Zeilen nach Sichtbarkeitsregel und lokalem Filter. */
  protected readonly filteredEff = computed(() => {
    const sichtbar = this.clSicht().sichtbar;
    const q = this.clFilter().toLowerCase();
    return q ? sichtbar.filter((w) => w.search.includes(q)) : sichtbar;
  });

  private path(): string {
    const it = this.state.selItem();
    return it ? itemPath(it) : '';
  }

  private parentPath(): string {
    const it = this.state.selItem();
    return it && it.kind === 'ausp' ? it.parentNode.path : '';
  }

  // ── Aktionen ────────────────────────────────────────────────────────

  protected setStatus(id: string, insHinweisfeld = false): void {
    // Zentrale Statusaenderung: kaskadiert bei aufnehmender Wirkung die
    // Zwingend-Vorbelegung in den Teilbaum darunter (DispositionService).
    this.disposition.setzeStatus(this.path(), id || undefined);
    // „Zu klären" parkt den Punkt und stellt den Cursor ins Hinweisfeld (#41) —
    // ein Text ist nicht erzwungen, damit der Tastaturfluss nicht abreisst.
    if (insHinweisfeld) queueMicrotask(() => this.hinweisFeld()?.nativeElement.focus());
  }

  /**
   * Nachrichten-Modus: Angabe aus der Nachricht entfernen bzw. wieder
   * aufnehmen. Modelltechnisch derselbe Ausschluss-Status wie beim Profilieren
   * (der Export entfernt daraufhin alle Vorkommen), fachlich aber eine andere
   * Aussage — deshalb eigene Beschriftung statt Status-Strip.
   */
  protected toggleEntfernt(): void {
    const ex = this.state.exclStatus();
    if (!ex) {
      this.toast.show('Kein Status mit Wirkung „ausgeschlossen" konfiguriert (siehe „Status…").');
      return;
    }
    const path = this.path();
    const entfernt = this.state.statusOf(path)?.wirkung === 'ausgeschlossen';
    // Die Mindestanzahl der Profilierung gilt auf jedem Weg, der eine Angabe
    // entfernt — nicht nur am gefuehrten Entscheidungspunkt (Issue #50).
    const sperre = entfernt ? null : this.guided.kardSperreWeglassen(path);
    if (sperre) {
      this.toast.show(sperre);
      return;
    }
    this.state.setElementProfile(path, { status: entfernt ? undefined : ex.id });
  }

  protected setField(key: 'min' | 'max' | 'anmerkung' | 'beispiel', e: Event): void {
    const el = e.target as HTMLInputElement | HTMLTextAreaElement;
    const v = el.value.trim();
    // Die Werte-Einschraenkung wird hier ebenso geprueft wie im Baum
    // (`tree-node.onValueChange`). Vorher hing sie im Detailbereich allein am
    // `readOnly` des Feldes, das nur bei `codelist?.restricted` gesetzt wird —
    // eine `werte`-Einschraenkung an einem Blatt *ohne* Codeliste (ueber Import
    // oder Migration erreichbar) blockierte im Baum, hier nicht. Die Invariante
    // "nur freigegebene Werte landen im Modell" darf nicht an einem
    // Template-Attribut haengen.
    if (key === 'beispiel' && this.msgMode()) {
      const verstoss = this.values.werteVerstoss(this.path(), v);
      if (verstoss) {
        this.toast.show(verstoss + ' Zulässig sind nur die Werte aus der Liste.');
        el.value = this.state.elemente()[this.path()]?.beispiel ?? '';
        return;
      }
    }
    this.state.setElementProfile(this.path(), { [key]: v || undefined });
  }

  protected onNeuerHinweis(e: Event): void {
    this.neuerHinweis.set((e.target as HTMLTextAreaElement).value);
  }

  /**
   * Neuen Hinweis am Element anlegen. Das Eingabefeld wird erst **nach** der
   * Server-Antwort geleert — scheitert das Schreiben, ist die Formulierung sonst
   * verloren und nur der Toast bleibt. Der Hinweis steht danach als eigener
   * Eintrag in der Liste darueber (mehrere je Element, kein Ueberschreiben).
   */
  protected async addHinweis(): Promise<void> {
    const text = this.neuerHinweis().trim();
    if (!text) return;
    // Beim ersten Hinweis einmalig nach dem Namen fragen (Issue #40); danach ist
    // er vorbelegt und am Feld aenderbar. Ein Abbruch haelt den Hinweis nicht
    // auf — die Rueckmeldung ist wichtiger als der Klarname.
    if (!this.hinweise.autor())
      this.hinweise.setzeAutor(prompt('Ihr Name — er erscheint an Ihren Hinweisen:') ?? '');
    if (await this.hinweisSchreiben(this.hinweise.anlegen(this.path(), text)))
      this.neuerHinweis.set('');
  }

  protected onAutor(e: Event): void {
    this.hinweise.setzeAutor((e.target as HTMLInputElement).value);
  }

  /** „Müller (BLK-AG), 26.07.30" — Herkunft am Hinweis (Issue #40). */
  protected herkunft(h: Hinweis): string {
    return hinweisHerkunft(h);
  }

  protected async toggleHinweisErledigt(id: string, e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const checked = el.checked;
    // Scheitert das Schreiben, bleibt der Store unveraendert — die Checkbox
    // haette ihren neuen Zustand dann behalten, obwohl nichts passiert ist.
    if (!(await this.hinweisSchreiben(this.hinweise.aendern(id, { erledigt: checked }))))
      el.checked = !checked;
  }

  protected loescheHinweis(id: string): void {
    void this.hinweisSchreiben(this.hinweise.loeschen(id));
  }

  /**
   * Schreibfehler sichtbar machen — die Liste bliebe sonst stumm veraltet. Gibt
   * zurueck, ob der Schreibvorgang durchging.
   */
  private async hinweisSchreiben(p: Promise<unknown>): Promise<boolean> {
    try {
      await p;
      return true;
    } catch (e) {
      this.log.error('Hinweise', 'Schreiben fehlgeschlagen', e);
      this.toast.show(hinweisFehlerText(e));
      return false;
    }
  }

  protected onAuspNameSelf(e: Event): void {
    const it = this.state.selItem();
    if (!it || it.kind !== 'ausp') return;
    this.state.renameAusp(it.parentNode.path, it.ausp.id, (e.target as HTMLInputElement).value);
  }

  protected addAusp(): void {
    this.state.addAusp(this.path());
  }

  protected renameAuspRow(id: string, e: Event): void {
    this.state.renameAusp(this.path(), id, (e.target as HTMLInputElement).value);
  }

  protected delAuspRow(id: string): void {
    const sperre =
      this.guided.auspSperreEntfernen(this.path(), id) ??
      this.guided.kardSperreEntfernen(this.path());
    if (sperre) {
      this.toast.show(sperre);
      return;
    }
    if (confirm('Ausprägung samt Unter-Profilierung löschen?'))
      this.state.removeAusp(this.path(), id);
  }

  protected toggleWert(value: string): void {
    const cl = this.vm()?.codelist;
    if (!cl?.eff) return;
    const all = cl.eff.map((w) => w.value);
    const p = this.state.elemente()[this.path()] ?? {};
    // Kein `werte`-Feld = keine Einschraenkung = alle zugelassen; ein leeres
    // Array (nach „keine") ist dagegen der Startpunkt fuer Einzel-Zulassungen.
    const cur = p.werte ? new Set(p.werte) : new Set(all);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    const sel = all.filter((v) => cur.has(v));
    this.state.setElementProfile(this.path(), {
      werte: sel.length === all.length ? undefined : sel,
    });
  }

  protected clAll(): void {
    this.state.setElementProfile(this.path(), { werte: undefined });
  }

  protected clNone(): void {
    this.state.setElementProfile(this.path(), { werte: [] });
  }

  protected onManualWerte(e: Event): void {
    const lines = (e.target as HTMLTextAreaElement).value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    this.state.setElementProfile(this.path(), { werte: lines.length ? lines : undefined });
  }

  protected onClFilter(e: Event): void {
    this.clFilter.set((e.target as HTMLInputElement).value);
  }

  protected onClAlle(e: Event): void {
    this.clAlle.set((e.target as HTMLInputElement).checked);
  }

  // ── Schema-Erweiterung ──────────────────────────────────────────────

  /** Elternpfad + id der ausgewaehlten Erweiterung (null, wenn keine gewaehlt). */
  private erwKontext(): { parentPath: string; id: string } | null {
    const it = this.state.selItem();
    if (!it || it.kind !== 'el' || !it.node.erweiterung) return null;
    const i = it.node.path.lastIndexOf('/~');
    if (i < 0) return null;
    return { parentPath: it.node.path.slice(0, i), id: it.node.erweiterung.id };
  }

  protected setErwField(key: 'name' | 'beschreibung' | 'min' | 'max', e: Event): void {
    const ctx = this.erwKontext();
    if (!ctx) return;
    const v = (e.target as HTMLInputElement | HTMLTextAreaElement).value.trim();
    if (key === 'name') {
      if (!ERW_NAME_MUSTER.test(v)) {
        this.toast.show('Kein gültiger XML-Elementname — Änderung nicht übernommen.');
        return;
      }
      this.state.updateErweiterung(ctx.parentPath, ctx.id, { name: v });
      return;
    }
    if (key === 'min' || key === 'max') {
      const wert = key === 'max' && v === '*' ? 'unbounded' : v || '1';
      this.state.updateErweiterung(ctx.parentPath, ctx.id, { [key]: wert });
      return;
    }
    this.state.updateErweiterung(ctx.parentPath, ctx.id, { beschreibung: v || undefined });
  }

  protected onErwTypWahl(e: Event): void {
    const ctx = this.erwKontext();
    if (!ctx) return;
    const wahl = (e.target as HTMLSelectElement).value;
    if (wahl === 'sonstig') {
      // Erst mit dem Freitext wird der Typ gesetzt; bis dahin nur Anzeige-Zustand.
      this.erwSonstig.set(this.path());
      return;
    }
    this.erwSonstig.set(null);
    this.state.updateErweiterung(ctx.parentPath, ctx.id, {
      datentyp: wahl === 'container' ? undefined : wahl,
    });
  }

  protected onErwTypFrei(e: Event): void {
    const ctx = this.erwKontext();
    if (!ctx) return;
    const v = (e.target as HTMLInputElement).value.trim();
    if (v) this.erwSonstig.set(null);
    this.state.updateErweiterung(ctx.parentPath, ctx.id, { datentyp: v || undefined });
  }

  /** "+ Unterelement": Erweiterungs-Dialog fuer ein Kind der aktuellen Erweiterung. */
  protected addErwUnter(): void {
    const it = this.state.selItem();
    if (!it || it.kind !== 'el') return;
    const namen = this.tree
      .kinder(it.node)
      .filter((c) => !c.synthetic)
      .map((c) => c.name);
    this.erwDialog.oeffneNeu(it.node.path, namen);
  }

  protected delErw(): void {
    const ctx = this.erwKontext();
    const it = this.state.selItem();
    if (!ctx || !it || it.kind !== 'el' || !it.node.erweiterung) return;
    if (
      confirm('Schema-Erweiterung „' + it.node.erweiterung.name + '" samt Unterelementen löschen?')
    )
      this.state.removeErweiterung(ctx.parentPath, ctx.id);
  }

  /**
   * Ziel-Vorkommen waehlen. Im Nachrichten-Modus vergibt das Werkzeug dabei die
   * Nummern an beiden Enden (#30); beim Profilieren bleibt es bei der reinen
   * Zielangabe am Traeger.
   */
  protected setRefZiel(e: Event): void {
    const wahl = (e.target as HTMLSelectElement).value;
    const pfad = this.vm()?.ref?.pfad ?? this.path();
    if (this.msgMode()) {
      this.guided.waehleVerweisZiel(pfad, wahl || null);
      return;
    }
    this.state.setElementProfile(pfad, { refZiel: wahl || undefined });
  }

  protected refJump(): void {
    const cur = this.vm()?.ref?.cur;
    if (cur) this.nav.jumpTo(cur);
  }

  // ── Gefuehrte Entscheidung ──────────────────────────────────────────

  protected onZweig(childPath: string, e: Event): void {
    this.guided.setzeZweig(this.path(), childPath, (e.target as HTMLInputElement).checked);
  }

  // ── Gefuehrte Instanz-Entscheidung (Testnachricht erstellen) ────────

  /** aufnehmen (true) / weglassen (false); erneuter Klick nimmt die Entscheidung zurueck. */
  protected aufnahme(auf: boolean): void {
    const w = this.state.wirkungOf(this.path());
    const aktiv = auf ? w === 'pflicht' : w === 'ausgeschlossen';
    this.guided.setzeAufnahme(this.path(), aktiv ? null : auf);
  }

  /** Instanz-Auswahl: genau einen Zweig waehlen. */
  protected waehleZweig(zweigPath: string): void {
    this.guided.waehleZweig(this.path(), zweigPath);
  }

  /** Wuerfel-Button: typkonformen Dummy-Wert in das aktuelle Blatt setzen. */
  protected wuerfeln(): void {
    const it = this.state.selItem();
    if (!it) return;
    const n = it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
    const path = this.path();
    this.state.setElementProfile(path, {
      beispiel: this.values.dummyFor({
        name: n.name,
        path,
        typeName: n.typeName,
        codelist: n.codelist,
      }),
    });
  }

  /** Nachrichten-Modus: Codelisten-Wert per Klick als Blattwert uebernehmen. */
  protected setWertAusListe(value: string): void {
    this.state.setElementProfile(this.path(), { beispiel: value });
  }

  /**
   * Vorschlag der gebundenen Profilierung uebernehmen — erst damit (oder mit
   * einer eigenen Eingabe) gilt der Entscheidungspunkt als erledigt.
   */
  protected uebernehmeVorschlag(): void {
    const wert = this.vm()?.vorschlag;
    if (wert) this.state.setElementProfile(this.path(), { beispiel: wert });
  }

  /**
   * Weiteres Vorkommen eines wiederholbaren Elements (Nachrichten-Modus):
   * erster Klick fuehrt den generischen Unterbaum als "Fall 1" weiter und legt
   * ein leeres zweites Vorkommen an (duplicateElement); danach je Klick eines.
   * Bei erreichter Hoechstanzahl gesperrt (Grund im Toast und am Knopf).
   *
   * Fuehrt die gebundene Fassung am Element Auspraegungen, gibt es diesen Weg
   * nicht — dort entsteht jedes weitere Vorkommen als Kopie einer profilierten
   * Auspraegung (`addVorkommenAusProfil`, #28).
   */
  protected addVorkommen(): void {
    const sperre = this.guided.kardSperreHinzu(this.path());
    if (sperre) {
      this.toast.show(sperre);
      return;
    }
    const list = this.state.auspsOf(this.path());
    if (!list?.length) this.state.duplicateElement(this.path());
    else this.state.addAusp(this.path(), 'Vorkommen ' + (list.length + 1));
  }

  /** Weiteres Vorkommen als Kopie der gewaehlten profilierten Auspraegung (#28). */
  protected addVorkommenAusProfil(auspId: string): void {
    this.copyVorkommen(auspId);
  }

  /**
   * Vorkommen samt erfasster Werte kopieren (Kopie danach anpassen). Legt ein
   * weiteres Vorkommen an und sperrt darum bei erreichter Hoechstanzahl —
   * genau wie `addVorkommen` und der gleiche Weg im Baum (`onDup`).
   */
  protected copyVorkommen(id: string): void {
    const sperre = this.guided.kardSperreHinzu(this.path());
    if (sperre) {
      this.toast.show(sperre);
      return;
    }
    this.state.copyAusp(this.path(), id);
  }

  protected bestaetigeAuswahl(): void {
    this.guided.bestaetigeAuswahl(this.path());
  }

  /** Wiederverwendbaren Freitext in die Anmerkung des aktuellen Elements uebernehmen. */
  protected uebernehmeAnmerkung(text: string): void {
    this.state.setElementProfile(this.path(), { anmerkung: text });
  }

  protected guidedPrev(): void {
    this.guided.gotoPrev();
  }

  protected guidedNext(): void {
    this.guided.gotoNext();
  }

  protected guidedNextOpen(): void {
    this.guided.gotoNextOpen();
  }

  protected async fetchSingle(): Promise<void> {
    const kennung = this.vm()?.codelist?.kennung;
    if (!kennung) return;
    try {
      const cl = await this.codelistSvc.fetchSingleCodelist(kennung);
      this.toast.show(
        `Codeliste „${cl.name || cl.kennung}" geladen (V ${cl.version}, ${cl.werte.length} Werte).`,
      );
    } catch (e) {
      this.toast.show(
        'Abruf fehlgeschlagen: ' +
          (e instanceof Error ? e.message : e) +
          ' — ggf. ZIP über „Codelisten: Datei…" laden.',
      );
    }
  }
}
