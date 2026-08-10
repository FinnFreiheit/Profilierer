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
import { UiSettingsService } from '../../core/services/ui-settings.service';
import { SearchService } from '../../core/services/search.service';
import { DetailAnsicht } from '../../core/ansicht/detail-ansicht';
import { itemPath } from '../../models/node.model';
import { pretty } from '../../core/util/pretty.util';
import { hinweisFehlerText, hinweisHerkunft } from '../../core/util/hinweis.util';
import { erwLoeschFrage, erwTypwechselFrage } from '../../core/util/erweiterung.util';
import { Hinweis } from '../../models/profile.model';
import { ERW_NAME_MUSTER } from '../../core/profile-defaults';
import { DatentypWahl } from '../../core/util/datentyp.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { DatentypPicker } from '../datentyp-picker/datentyp-picker';

/**
 * Detailbereich (Profilierer.html Z.1506-1666): Status, Kardinalitaet,
 * Ausprägungen, Codelisten-Werte, Verweisziel, Anmerkung, Beispielwert.
 */
@Component({
  selector: 'app-detail-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detail-panel.html',
  imports: [DatentypPicker, KeinAutofillDirective],
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
  /** Die Anzeige-Ableitung; die Komponente rendert sie nur. */
  private readonly detailAnsicht = inject(DetailAnsicht);

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

  /**
   * Ist der Rueckmeldekanal bedienbar (Issue #42)? Beim Profilieren wie bisher;
   * zusaetzlich im **schreibgeschuetzten** Editor einer abgenommenen
   * Profilierung — dort ist das Hinweisfeld das einzige bedienbare Element.
   * Gebunden an "Abnahme-Schreibschutz aktiv **und** ein Profil geladen": in
   * der reinen Schema-Ansicht und im Nachrichten-Modus gibt es kein Profil, an
   * dem ein Hinweis haengen koennte.
   */
  protected readonly hinweiseBedienbar = computed(() => {
    if (this.msgMode() || this.state.schemaView()) return false;
    if (!this.roEff()) return true;
    return this.state.abnahmeSchreibschutz() && !!this.state.activeProfileId();
  });

  /** Gefuehrte Testnachricht-Erstellung (US "Testnachricht gefuehrt erstellen"). */
  protected readonly isCreate = this.state.isMessageCreate;

  // ── Spaltenbreite und Sichtbarkeit (#81) ────────────────────────────
  //
  // Die Spalte belegt seit #81 immer Platz — auch ohne Auswahl. Vorher hing
  // ihre Sichtbarkeit an der Selektion, wodurch der erste Klick auf einen
  // Kasten den Baumbereich schlagartig um ~400px verschmaelerte und die
  // gesamte Kaskade neu umbrach.

  private readonly ui = inject(UiSettingsService);

  /**
   * Ohne geladene Nachricht gibt es keine Spalte: dort steht der Einstiegstext
   * in voller Breite. Der einmalige Sprung beim Laden einer Nachricht ist
   * gewollt — dort fuellt sich ohnehin der ganze Bildschirm.
   */
  protected readonly hasRoot = this.state.hasRoot;

  /** Von Hand gezogene Breite in px; `null` = automatische Breite (CSS-clamp). */
  protected readonly breite = this.ui.zahl('detailBreite', null);
  /** Bewusst weggeklappte Spalte (Knopf im Panelkopf). */
  protected readonly eingeklappt = this.ui.flagge('detailZu', false);
  /** Aufgeklappte Standard-Beschreibung; sie ist sonst auf wenige Zeilen gedeckelt. */
  protected readonly dokuOffen = signal(false);

  // ── Ruhezustand: offene Punkte statt leerer Spalte (#82) ────────────

  private readonly suche = inject(SearchService);

  /** Wie viele offene Punkte die Liste zeigt, bevor sie auf die Gesamtzahl verweist. */
  private static readonly RUHE_MAX = 10;

  /**
   * Was ohne Auswahl in der Spalte steht: die naechsten offenen Punkte zum
   * Anspringen. Im Instanz-Modus zaehlen nur die kritischen — dort ist
   * "offen" alles, was die Schema-Vollstaendigkeit verletzt (ADR 0016);
   * uebergangene freie Felder sind keine Restarbeit.
   */
  protected readonly ruheOffen = computed(() => {
    if (!this.state.hasRoot() || this.state.schemaView()) return [];
    const alle = this.guided.offeneListe();
    return this.guided.instanzModus() ? alle.filter((p) => p.kritisch) : alle;
  });

  /** Beschriftung der Sprungliste; der Suchindex kennt Label und Pfadkette schon. */
  protected readonly ruheListe = computed(() => {
    const offen = this.ruheOffen();
    if (!offen.length) return [];
    const index = new Map(this.suche.index().map((e) => [e.path, e]));
    return offen.slice(0, DetailPanel.RUHE_MAX).map((p) => {
      const e = index.get(p.path);
      return {
        path: p.path,
        label: e?.label || p.path.split('/').pop() || p.path,
        crumb: e?.crumb ?? '',
      };
    });
  });

  /** Wie viele Punkte die Liste nicht zeigt — nie stillschweigend abschneiden. */
  protected readonly ruheWeitere = computed(() =>
    Math.max(0, this.ruheOffen().length - DetailPanel.RUHE_MAX),
  );

  /** Ueberschrift der Liste: im Durchlauf sind es Pflichtangaben, sonst Entscheidungen. */
  protected readonly ruheTitel = computed(() =>
    this.guided.instanzModus() ? 'Offene Pflichtangaben' : 'Offene Entscheidungen',
  );

  protected springeZu(path: string): void {
    this.nav.jumpTo(path, true);
  }

  /** Untere Grenze: darunter passen Statusknoepfe und Kardinalitaet nicht mehr nebeneinander. */
  private static readonly MIN_BREITE = 300;

  /** Obere Grenze: dem Baum muss die Mehrheit des Fensters bleiben. */
  private maxBreite(): number {
    return Math.max(DetailPanel.MIN_BREITE, Math.round(window.innerWidth * 0.6));
  }

  protected einklappen(): void {
    this.eingeklappt.set(true);
  }

  protected ausklappen(): void {
    this.eingeklappt.set(false);
  }

  protected breiteZuruecksetzen(): void {
    this.breite.set(null);
  }

  /**
   * Ziehen am Griff. Pointer-Events statt Maus-Events, damit Trackpad und
   * Stift gleich behandelt werden; `setPointerCapture` haelt das Ziehen auch
   * dann fest, wenn der Zeiger den schmalen Griff verlaesst.
   *
   * Der Doppelklick (zurueck auf automatische Breite) wird hier an `detail`
   * mitgelesen statt ueber ein eigenes `dblclick`: das `preventDefault()`
   * unten unterdrueckt die daraus abgeleiteten Maus-Ereignisse, ein
   * `(dblclick)`-Binding am Griff feuerte also nie.
   */
  protected griffAb(ev: PointerEvent): void {
    if (this.eingeklappt()) return;
    const griff = ev.target as HTMLElement;
    const panel = griff.closest<HTMLElement>('#detail');
    if (!panel) return;
    if (ev.detail >= 2) {
      this.breiteZuruecksetzen();
      return;
    }
    ev.preventDefault();
    const startX = ev.clientX;
    const startBreite = panel.getBoundingClientRect().width;
    griff.setPointerCapture(ev.pointerId);

    const zieh = (e: PointerEvent): void => {
      // Der Griff sitzt links am Panel: nach links ziehen macht breiter.
      const roh = startBreite + (startX - e.clientX);
      this.breite.set(
        Math.round(Math.min(this.maxBreite(), Math.max(DetailPanel.MIN_BREITE, roh))),
      );
    };
    const los = (): void => {
      griff.removeEventListener('pointermove', zieh);
      griff.removeEventListener('pointerup', los);
      griff.removeEventListener('pointercancel', los);
    };
    griff.addEventListener('pointermove', zieh);
    griff.addEventListener('pointerup', los);
    griff.addEventListener('pointercancel', los);
  }

  /**
   * Das Anzeige-Modell des ausgewaehlten Punkts. Die Ableitung liegt im
   * `DetailAnsicht`-Modul (core/ansicht) — hier wird sie nur gerendert.
   */
  protected readonly vm = computed(() => this.detailAnsicht.punkt());

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
   * Gefuehrte Instanz-Station (US "Testnachricht gefuehrt erstellen"): am
   * optionalen **Container** angeben/uebergehen, genau EIN Zweig je Auswahl,
   * Wert-Hinweis fuer Blaetter und die Spur-Navigation. Am optionalen **Blatt**
   * gibt es keine Ja/Nein-Frage — der Wert entscheidet (ADR 0016).
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

    // Freies Feld: ein optionales Blatt, an dem der Wert allein entscheidet.
    const freierWert = punkt?.art === 'wert' && punkt.pflicht === false;
    const wertOffen =
      (punkt?.art === 'wert' || (punkt?.art === 'auspraegung' && punkt.leaf)) &&
      !!this.state.elemente()[path]?.beispiel?.trim() &&
      !this.guided.wertOk(path);

    return {
      art: punkt?.art ?? null,
      istPunkt: !!punkt,
      offen: offene.has(path),
      nOffen: offene.size,
      freierWert,
      // Einordnung der Station (grün = die Nachricht verlangt sie, orange =
      // frei) und der Grund, warum „Weiter" hier nicht weiterkommt.
      stationArt: this.guided.stationArt(path),
      ueberspringSperre: this.guided.ueberspringSperre(),
      // Container-Station: angegeben (Ast ist Teil der Nachricht) und der Grund,
      // warum sich das nicht zuruecknehmen laesst.
      angegeben: w === 'pflicht',
      angabeSperre: punkt?.art === 'element' ? this.guided.angabeSperre(path) : null,
      entfaellt: !w && this.state.inheritedExcluded(path),
      zweige,
      wertOffen,
      // Gebundener Durchlauf: was die Profilierung festlegt bzw. offen laesst.
      zwingend: this.state.profilWirkungGeerbt(path) === 'pflicht',
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
    // Reihenfolge der Ableitung, entschieden in der Nachlese zu #38 (Issue #55):
    // `roEff()` gewinnt gegen `msgMode()`. Ein im gebundenen Durchlauf
    // ausgeschlossener Pfad gilt damit als **Lesen** und behaelt den Umschalter
    // „alle zeigen" — die Frage „was hat die Profilierung ausgeschlossen?" ist
    // auch dort legitim, und uebernehmbar ist ohnehin nichts (die Zeilen rendern
    // im roEff()-Zweig ohne Klick-Uebernahme). Das AC aus #38 („im
    // Nachrichten-Modus keinen Umschalter") meint den befuellbaren Fall.
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

  /**
   * Darf dieser Eintrag geaendert/abgehakt/geloescht werden (Issue #42)? An
   * einer abgenommenen Profilierung ist das der AG vorbehalten — Ausnahme ist
   * der selbst angelegte Eintrag derselben Sitzung. Der Server entscheidet
   * dasselbe noch einmal; hier geht es darum, keine Knoepfe anzubieten, die
   * ohnehin abgewiesen wuerden.
   */
  protected darfAendern(hinweisId: string): boolean {
    if (!this.state.abnahmeSchreibschutz()) return true;
    return this.hinweise.istEigener(hinweisId);
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

  /**
   * Wahl aus dem Typwaehler (#96): Typ und Herkunft wandern zusammen ins Profil.
   *
   * Der neue Typ bringt eine andere Struktur mit — was unter dem alten Typ
   * festgelegt wurde, zeigt danach ins Leere (#97). Liegt etwas darunter, faellt
   * die Entscheidung mit Zahl beim Anwender; sonst wechselt der Typ kommentarlos.
   */
  protected onErwTyp(wahl: DatentypWahl): void {
    const ctx = this.erwKontext();
    const it = this.state.selItem();
    if (!ctx || !it || it.kind !== 'el' || !it.node.erweiterung) return;
    const alt = it.node.erweiterung;
    if (alt.datentyp === wahl.datentyp && alt.datentypQuelle === wahl.datentypQuelle) return;
    const n = this.state.festlegungenUnter(it.node.path);
    if (n) {
      if (!confirm(erwTypwechselFrage(alt.name, n))) return;
      this.state.bereinigeUnter(it.node.path);
    }
    this.state.updateErweiterung(ctx.parentPath, ctx.id, {
      datentyp: wahl.datentyp,
      datentypQuelle: wahl.datentypQuelle,
    });
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
      confirm(erwLoeschFrage(it.node.erweiterung.name, this.state.festlegungenUnter(it.node.path)))
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

  /**
   * Container angeben (Taste ↓): aufnehmen und in den Ast springen — derselbe
   * Weg wie die Tastatur, damit Maus und Tastatur nicht auseinanderlaufen.
   */
  protected angeben(): void {
    this.guided.betreteStation();
  }

  /**
   * Container uebergehen (Taste →): eine gesetzte Angabe zuruecknehmen und
   * weiterblaettern. Greift eine Sperre, bleibt der Ast und der Grund wird
   * genannt — geblaettert wird trotzdem.
   */
  protected nichtAngeben(): void {
    const path = this.path();
    if (this.state.wirkungOf(path) === 'pflicht' && !this.guided.gibNichtAn(path)) {
      const grund = this.guided.angabeSperre(path);
      if (grund) this.toast.show(grund);
    }
    this.guidedNext();
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

  /**
   * „Weiter ›" — dieselbe Bewegung wie Taste ↓, samt derselben Sperre: eine
   * offene Pflichtangabe haelt die Spur fest und nennt den Grund.
   */
  protected guidedNext(): void {
    const grund = this.guided.ueberspringSperre();
    if (grund) {
      this.toast.show(grund);
      return;
    }
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
