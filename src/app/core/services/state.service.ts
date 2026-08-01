import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Auspraegung,
  ElementProfile,
  Erweiterung,
  ProfileDoc,
  ProfileMeta,
  Status,
  Wirkung,
} from '../../models/profile.model';
import { TreeItem, TreeNode, itemPath } from '../../models/node.model';
import { auspTeile, blattName, unterPfad, vorfahren } from '../util/pfad.util';
import { VorgabeSicht } from '../vorgabe-sicht';
import { Codelist } from '../../models/codelist.model';
import { DiffAnc, DiffEntry } from '../../models/diff.model';
import { XsdDoc, XsdIndex } from '../../models/xsd-index.model';
import { BundledVersion } from '../../models/schema-bundle.model';
import { MessageCreateSession, MessageEditSession } from '../../models/testmessage.model';
import { newProfile } from '../profile-defaults';
import { pretty } from '../util/pretty.util';
import { REF_TARGETS } from '../refs';
import { HinweisStoreService } from './hinweis-store.service';

/**
 * Zentraler Signals-Store. Ersetzt das globale `S`/`S.profile` aus
 * Profilierer.html (Z.327-335). Jedes Zustandsfeld ist ein Signal; abgeleitete
 * Sichten sind `computed`. Die imperative `renderAll()`-Kaskade entfaellt —
 * die Angular-Change-Detection reagiert auf Signal-Aenderungen.
 *
 * Wichtig: Signals vergleichen per Referenz. Jede Mutation der pfad-indizierten
 * Maps erzeugt daher eine neue Objekt-/Set-Referenz.
 */
@Injectable({ providedIn: 'root' })
export class StateService {
  /**
   * Hinweise liegen als eigene Ressource neben der Profilierung (ADR 0014) und
   * sind kein Teil dieses Stores — gelesen wird hier nur, welche Elemente einen
   * tragen, damit sie im "nur Werte"-Modus sichtbar bleiben.
   */
  private readonly hinweisStore = inject(HinweisStoreService);

  // ── Schema / Nachricht ──────────────────────────────────────────────
  readonly docs = signal<XsdDoc[]>([]);
  readonly idx = signal<XsdIndex | null>(null);
  readonly version = signal('');
  readonly standardKennung = signal('');
  readonly msgName = signal<string | null>(null);
  readonly root = signal<TreeNode | null>(null);

  /** Im Projekt hinterlegte Schemaversionen (public/schemas/, aus dem Manifest). */
  readonly bundledVersions = signal<BundledVersion[]>([]);
  /** dir der aktuell als Primaerschema geladenen hinterlegten Version (null = Ordner-Upload). */
  readonly activeBundle = signal<string | null>(null);

  // ── Profil (frueher S.profile) ──────────────────────────────────────
  readonly meta = signal<ProfileMeta>({});
  readonly statuses = signal<Status[]>(newProfile().statuses);
  readonly elemente = signal<Record<string, ElementProfile>>({});
  readonly auspraegungen = signal<Record<string, Auspraegung[]>>({});
  readonly erweiterungen = signal<Record<string, Erweiterung[]>>({});

  // ── Vorgabe-Schicht (eingefrorene Profilkopie) ──────────────────────
  /**
   * Zweites Profil-Dokument unter dem Entscheidungsstand: die **Vorgabe**
   * (Spec "Testnachricht gefuehrt aus einer Profilierung"). Waehrend eines
   * Durchlaufs ist sie schreibgeschuetzt — keine Mutation des Stores fasst sie
   * an; gesetzt und geleert wird sie ausschliesslich ueber `setVorgabe` /
   * `clearVorgabe`. Die Lesezugriffe (Wirkung, Kardinalitaet, Codelisten-Werte,
   * Auspraegungen, Anmerkung, Beispielwert, Verweisziel) fragen zuerst die
   * Entscheidungsschicht (`elemente`/`auspraegungen`) und fallen auf die
   * Vorgabe zurueck. Ohne gesetzte Vorgabe (`null`) verhaelt sich der Store
   * exakt wie zuvor.
   */
  readonly vorgabe = signal<ProfileDoc | null>(null);

  /** Laeuft der Durchlauf gegen eine gebundene Profilfassung? */
  readonly hatVorgabe = computed(() => !!this.vorgabe());

  /**
   * Bindet eine Profilfassung als Vorgabe. Das Dokument wird beim Setzen
   * kopiert: die Vorgabe ist eine eingefrorene Fassung und darf sich nicht
   * aendern, wenn der Aufrufer sein Ausgangsdokument spaeter weiterbearbeitet.
   */
  setVorgabe(doc: ProfileDoc): void {
    this.vorgabe.set(structuredClone(doc));
  }

  clearVorgabe(): void {
    this.vorgabe.set(null);
  }

  /**
   * Die Lesart der gebundenen Fassung (Quellpfad, Erben, kein Mischen) — das
   * eine Modul dafuer ist `VorgabeSicht`; der Store ist nur der Signals-Adapter
   * darueber. Die Instanz-Maps gehen als **Live-Getter** hinein: die Sicht
   * liest sie erst beim Zugriff, also im reaktiven Kontext des jeweiligen
   * Aufrufers — ein Lesart-Konsument trackt nur die Signale, die sein Zugriff
   * tatsaechlich beruehrt. Ein materialisiertes Objekt liess hier jeden
   * Konsumenten `elemente()` und `auspraegungen()` tracken, auch wo die alte
   * Direkt-Implementierung das nie tat (Deep-Review-Befund).
   */
  private readonly vorgabeSicht = computed<VorgabeSicht | null>(() => {
    const v = this.vorgabe();
    if (!v) return null;
    const elemente = this.elemente;
    const auspraegungen = this.auspraegungen;
    return new VorgabeSicht(v, {
      get elemente() {
        return elemente();
      },
      get auspraegungen() {
        return auspraegungen();
      },
    });
  });

  /**
   * Derselbe Pfad, wie ihn die **Vorgabe** kennt: Vorkommen, die als Kopie einer
   * profilierten Auspraegung entstanden sind (`vonId`, #28), tragen eine zur
   * Laufzeit erzeugte id, die in der eingefrorenen Fassung nicht vorkommt. Fuer
   * jeden Lesezugriff auf die Vorgabe wird sie darum auf die id der Quelle
   * zurueckgeschrieben — nur so wirkt im kopierten Vorkommen die
   * Unter-Profilierung der Auspraegung, aus der es entstanden ist.
   *
   * Segmentweise, weil die eigene Liste am jeweiligen Listen-Pfad haengt: die
   * Vorfahren werden im **eigenen** Pfadraum nachgeschlagen und im **Vorgabe**-
   * Pfadraum aufgebaut.
   */
  /** Der Element-Eintrag der Vorgabe zu einem Pfad (null ohne Vorgabe/Eintrag). */
  private vorgabeProfile(path: string): ElementProfile | null {
    return this.vorgabeSicht()?.eintrag(path) ?? null;
  }

  /**
   * Die Auspraegungsliste der Vorgabe zu einem Pfad — mit derselben Aufloesung
   * kopierter Vorkommen wie `vorgabeProfile`, damit eine Kopie auch die
   * benannten Unter-Vorkommen ihrer Quelle erbt.
   */
  vorgabeAusps(path: string): Auspraegung[] | null {
    return this.vorgabeSicht()?.ausps(path) ?? null;
  }

  /**
   * Derselbe Eintrag, aber wie der gebundene Durchlauf ihn sieht: Vorkommen
   * erben die Aussage ihres Traegerelements. Ihre ids entstehen zur Laufzeit
   * (`…/beteiligung@a1/rolle`), die Profilierung kann sie gar nicht adressieren
   * — was generisch festgelegt ist, gilt darum in jedem Vorkommen. Nur wo die
   * gebundene Fassung den Vorkommen-Pfad selbst fuehrt (eigene Auspraegungen),
   * gewinnt der exakte Pfad. Gegenstueck zu `profilWirkungGeerbt` fuer Werte,
   * Anmerkung und Beispielwert.
   */
  private vorgabeProfileGeerbt(path: string): ElementProfile | null {
    return this.vorgabeSicht()?.eintragGeerbt(path) ?? null;
  }

  /**
   * Beispielwert **der Vorgabe** — was die gebundene Fassung an diesem Blatt
   * vorschlaegt, unabhaengig davon, ob der Durchlauf schon etwas eingetragen
   * hat. Er wird angeboten, nicht gesetzt (Spec "vorschlagen statt vorbelegen");
   * darum eine eigene Lesart neben `beispielOf`, das die Entscheidung vorzieht.
   */
  vorgabeBeispiel(path: string): string | null {
    return this.vorgabeProfileGeerbt(path)?.beispiel || null;
  }

  /**
   * Verweisziel **der Vorgabe** — welches Vorkommen die Profilierung an diesem
   * Verweis vorsieht. Grenze der Auswahl im gefuehrten Durchlauf (#30) und
   * darum eine eigene Lesart neben `refZielOf`, das die eigene Wahl vorzieht.
   */
  vorgabeRefZiel(path: string): string | null {
    return this.vorgabeProfileGeerbt(path)?.refZiel || null;
  }

  /**
   * Anmerkung **der Vorgabe** — der fachliche Hilfetext, den die Profilierung an
   * den Entscheidungspunkt schreibt. Gegenstueck zu `vorgabeBeispiel` und aus
   * demselben Grund eine eigene Lesart: `anmerkungOf` zieht die Entscheidung
   * vor, und sobald der Durchlauf eigene Anmerkungen fuehren darf, zeigte der
   * Hilfetext-Block sonst die eigene Notiz als „Anmerkung der Profilierung".
   */
  vorgabeAnmerkung(path: string): string | null {
    return this.vorgabeProfileGeerbt(path)?.anmerkung || null;
  }

  /**
   * Was die gebundene Fassung fuer diesen Pfad **festlegt** — unabhaengig davon,
   * ob der Durchlauf inzwischen eine eigene Entscheidung getroffen hat. Das ist
   * die Profil-Aussage, aus der die Fuehrung ihre Wirkungen und Marker ableitet:
   * `pflicht` = zwingend (nicht abwaehlbar), `optional` = anzugeben wenn
   * vorhanden, `markierung` = "zu klaeren", `null` = die Profilierung sagt
   * nichts ("nicht profiliert", Schema-Semantik gilt). Aufgeloest ueber die
   * Stufenliste **der Vorgabe** — Stufen sind je Profilierung frei
   * konfigurierbar, dieselbe id kann in beiden Schichten etwas anderes bedeuten.
   */
  profilWirkung(path: string): Wirkung | null {
    return this.vorgabeSicht()?.wirkung(path) ?? null;
  }

  /**
   * Dieselbe Aussage, aber wie der gebundene Durchlauf sie sieht: Vorkommen
   * erben die Festlegung ihres Traegerelements. Ihre ids entstehen zur Laufzeit
   * (`…/beteiligung@a1`), die Profilierung kann sie gar nicht adressieren — was
   * generisch zwingend gesetzt ist, gilt darum in jeder Auspraegung. Nur wo die
   * gebundene Fassung den Vorkommen-Pfad selbst fuehrt (eigene Auspraegungen),
   * gewinnt der exakte Pfad. Massgeblich fuer Wirkungen und Marker; die rohe
   * `profilWirkung` bleibt fuer alles, was pfadgenau bleiben muss.
   */
  profilWirkungGeerbt(path: string): Wirkung | null {
    return this.vorgabeSicht()?.wirkungGeerbt(path) ?? null;
  }

  /**
   * Wirkung, die *allein aus der Vorgabe* stammt: null, sobald der Durchlauf am
   * Pfad eine eigene Entscheidung fuehrt (dann ist die Entscheidung massgeblich)
   * oder keine Vorgabe gebunden ist.
   *
   * Ueber `profilWirkungGeerbt`, also mit Auflösung des Vorkommen-Pfades: was
   * generisch ausgeschlossen ist, ist in jedem Vorkommen gesperrt. Die Prueefung
   * auf die eigene Entscheidung bleibt pfadgenau — entschieden wird am konkreten
   * Vorkommen. Vorher las diese Stelle `profilWirkung`, wodurch ein
   * ausgeschlossenes Element innerhalb einer benannten Auspraegung befuellbar
   * blieb: der Vorfahren-Check in `vorgabeGesperrt` trifft nur den
   * Traegerknoten, nicht das Kind darunter (Issue #59).
   */
  private vorgabeWirkung(path: string): Wirkung | null {
    if (this.elemente()[path]?.status) return null;
    return this.profilWirkungGeerbt(path);
  }

  /**
   * Schliesst die gebundene Profilfassung diesen Pfad selbst aus? (ohne
   * Vererbung — fuer den Struktur-Walk, der den Teilbaum ohnehin abschneidet).
   */
  vorgabeSchliesstAus(path: string): boolean {
    return this.vorgabeWirkung(path) === 'ausgeschlossen';
  }

  /**
   * Ist der Pfad im gebundenen Durchlauf gesperrt — durch die Vorgabe selbst
   * oder durch einen ausgeschlossenen Vorfahren (der Ausschluss vererbt sich auf
   * den Teilbaum, ueber Vorkommen-Grenzen hinweg)? Gesperrtes ist nicht
   * befuellbar, standardmaessig ausgeblendet und wird nur ueber "nur Profil"
   * sichtbar. Eine *eigene* Weglassen-Entscheidung des Durchlaufs ist keine
   * Sperre — sie bleibt sichtbar und korrigierbar.
   */
  vorgabeGesperrt(path: string): boolean {
    if (!this.vorgabe()) return false;
    if (this.vorgabeSchliesstAus(path)) return true;
    return vorfahren(path).some((a) => this.vorgabeSchliesstAus(a));
  }

  // ── Ansicht / Bibliothek ────────────────────────────────────────────
  /** Dashboard (Bibliothek) vs. Baum-Editor vs. Testdaten-Speicher. Startseite ist das Dashboard. */
  readonly view = signal<'dashboard' | 'editor' | 'testdaten'>('dashboard');
  /** id des aktuell bearbeiteten Bibliothekseintrags (Ziel des Autosave). */
  readonly activeProfileId = signal<string | null>(null);
  /**
   * Abnahme-Schreibschutz: das geoeffnete Profil ist von der BLK-AG abgenommen
   * und die aktive Rolle ist Extern. Der Autosave pausiert (der Server wiese
   * jede Schreiboperation ohnehin ab); zum Weiterarbeiten dupliziert man.
   */
  readonly abnahmeSchreibschutz = signal(false);

  // ── UI-Zustand ──────────────────────────────────────────────────────
  readonly selItem = signal<TreeItem | null>(null);
  readonly open = signal<ReadonlySet<string>>(new Set());
  readonly codelists = signal<Record<string, Codelist>>({});
  readonly showTech = signal(false);
  readonly onlyProfile = signal(false);
  /** Nur Elemente mit Wert/Inhalt zeigen (Testnachricht statt ganzem Standard). */
  readonly onlyValues = signal(false);
  readonly showRefs = signal(true);
  readonly focusMode = signal(true);
  /** Blaetter linksbuendig auf die tiefste Spalte ausrichten (bündige Wertespalte). */
  readonly alignLeaves = signal(false);
  /** Betrachtungsmodus: gesperrte Ansicht ohne Profilier-Bedienelemente (Nachricht inspizieren). */
  readonly readOnly = signal(false);
  /**
   * Reine Schema-Ansicht (US "Schema ansehen"): das Schema nur betrachten und
   * durchsuchen — ohne Profilierung, Testnachricht oder Persistenz
   * (activeProfileId bleibt null, kein Autosave). Impliziert readOnly.
   */
  readonly schemaView = signal(false);
  /**
   * Aktive Bearbeitungs-Session einer geladenen XJustiz-Instanz (null = normales
   * Profil/Szenario). Gesetzt vom InstanceImportService; ermoeglicht den treuen
   * Re-Export als neue Nachricht (InstanceExportService). Wird bei jedem
   * Profil-Einstieg wieder geleert.
   */
  readonly messageEdit = signal<MessageEditSession | null>(null);
  /**
   * Laufende Sitzung "Testnachricht gefuehrt aus einem Schema erstellen"
   * (TestmessageCreateService). Schaltet Toolbar/Detailpanel in den
   * Erstellungs-Modus und traegt den Testspeicher-Eintrag der Sitzung.
   */
  readonly messageCreate = signal<MessageCreateSession | null>(null);
  /**
   * Gefuehrter Profilier-Modus: Fuehrungs-/Zaehlschicht ueber denselben Daten
   * (GuidedService). Reiner UI-Zustand, nicht Teil des ProfileDoc; bei neuen
   * Profilierungen standardmaessig an (createNew), sonst zuschaltbar. Bei der
   * gefuehrten Testnachricht-Erstellung ebenfalls an (Instanz-Modus).
   */
  readonly guided = signal(false);
  /** Profil, das vor dem XSD-Ordner geladen wurde (loadProfileFile, Z.1813). */
  readonly pendingMsg = signal<ProfileDoc | null>(null);
  /** Anzeige "automatisch gesichert HH:MM" (autosaveNow, Z.1481). */
  readonly autosaveInfo = signal('');

  /** Scroll-/Flash-Anforderung an den TreeCanvas (scrollToPath, Z.682-691). */
  readonly scrollTarget = signal<{ path: string; seq: number } | null>(null);
  private scrollN = 0;
  requestScroll(path: string): void {
    this.scrollTarget.set({ path, seq: ++this.scrollN });
  }

  // ── Versionsvergleich (Diff) ────────────────────────────────────────
  readonly showDiff = signal(false);
  readonly diffMap = signal<Map<string, DiffEntry> | null>(null);
  readonly diffAnc = signal<Map<string, DiffAnc> | null>(null);
  readonly idxB = signal<XsdIndex | null>(null);

  // ── Schemavalidierung (Fehler-Markierung im Baum) ───────────────────
  /** Voller Pfad (inkl. @auspId) → Fehlermeldungen des letzten Prueflaufs. */
  readonly valFehler = signal<Map<string, string[]> | null>(null);
  /** Vorfahren-Aggregat: voller Pfad → Anzahl Fehler im Teilbaum darunter. */
  readonly valAnc = signal<Map<string, number> | null>(null);

  clearValidierungsMarker(): void {
    this.valFehler.set(null);
    this.valAnc.set(null);
  }

  /** Laufender Zaehler fuer Ausprägungs-IDs (wie AUSPN, Z.1016). */
  private auspN = 0;
  /** Laufender Zaehler fuer Erweiterungs-IDs. */
  private erwN = 0;

  // ── Abgeleitete Sichten ─────────────────────────────────────────────

  /** Ist eine Nachricht geladen (Baum vorhanden)? */
  readonly hasRoot = computed(() => !!this.root());
  /** Nachrichten-Bearbeitung (geladene Instanz) statt Profil/Szenario. */
  readonly isMessageEdit = computed(() => !!this.messageEdit());
  /** Gefuehrte Testnachricht-Erstellung (US "Testnachricht gefuehrt erstellen"). */
  readonly isMessageCreate = computed(() => !!this.messageCreate());
  /** Nachrichten-Modus: eine Instanz wird erstellt oder bearbeitet (Werte statt Profil). */
  readonly msgMode = computed(() => this.isMessageEdit() || this.isMessageCreate());

  /** Das komplette Profil-Dokument als eine Sicht (fuer Persistenz/Export). */
  readonly profileDoc = computed<ProfileDoc>(() => ({
    meta: this.meta(),
    statuses: this.statuses(),
    elemente: this.elemente(),
    auspraegungen: this.auspraegungen(),
    erweiterungen: this.erweiterungen(),
  }));

  /** Fortschrittszaehler (updateFortschritt, Z.1453-1456). */
  readonly fortschritt = computed(() => {
    const nStatus = Object.values(this.elemente()).filter((p) => p.status).length;
    const nAusp = Object.values(this.auspraegungen()).reduce((s, l) => s + l.length, 0);
    const nErw = Object.values(this.erweiterungen()).reduce((s, l) => s + l.length, 0);
    return { nStatus, nAusp, nErw };
  });

  // ── Status-Zugriff ──────────────────────────────────────────────────

  /** statusById (Z.335). */
  statusById(id: string): Status | null {
    return this.statuses().find((s) => s.id === id) ?? null;
  }

  /** Die Statusstufe mit Wirkung "ausgeschlossen" (exclStatus, Z.603). */
  exclStatus(): Status | null {
    return this.statuses().find((s) => s.wirkung === 'ausgeschlossen') ?? null;
  }

  /** Die Statusstufe mit Wirkung "pflicht" (fuer die Zwingend-Vorbelegung). */
  pflichtStatus(): Status | null {
    return this.statuses().find((s) => s.wirkung === 'pflicht') ?? null;
  }

  /** Die Statusstufe mit Wirkung "optional" (Disposition "anzugeben, wenn vorhanden"). */
  optionalStatus(): Status | null {
    return this.statuses().find((s) => s.wirkung === 'optional') ?? null;
  }

  /**
   * Die Statusstufe mit Wirkung "markierung" — die vierte gefuehrte Entscheidung
   * "zu klaeren" (Issue #41). Wie die anderen drei ueber die **Wirkung**
   * aufgeloest, damit umbenannte oder eigene Stufen greifen; fehlt sie der
   * Profilierung, ist der Knopf deaktiviert.
   */
  markierungStatus(): Status | null {
    return this.statuses().find((s) => s.wirkung === 'markierung') ?? null;
  }

  /**
   * statusOf (Z.997) — Entscheidung, sonst Vorgabe. Der Status der Vorgabe wird
   * ueber **deren** Stufenliste aufgeloest: Statusstufen sind je Profilierung
   * frei konfigurierbar, dieselbe id kann in beiden Schichten etwas anderes
   * bedeuten. Massgeblich ist die Wirkung, nicht der Name.
   */
  statusOf(path: string): Status | null {
    const p = this.elemente()[path];
    if (p?.status) return this.statusById(p.status);
    const v = this.vorgabe();
    const vStatus = v?.elemente[path]?.status;
    return (vStatus && v?.statuses.find((s) => s.id === vStatus)) || null;
  }

  /** wirkungOf (Z.998). */
  wirkungOf(path: string): Wirkung | null {
    return this.statusOf(path)?.wirkung ?? null;
  }

  /**
   * inheritedExcluded (Z.1004-1006) — erbt ein Vorfahr seinen Ausschluss auf
   * diesen Pfad? Ueber `vorfahrenPfade`, also an den Grenzen '/' **und** '@':
   * der Traegerknoten einer Auspraegung steht in keinem '/'-Praefix seiner
   * Vorkommen (`…/beteiligung` fehlt in `…/beteiligung@a1/name`), sein
   * Ausschluss blieb dort sonst ohne Wirkung — die Sperre griffe
   * (`vorgabeGesperrt` zaehlt bereits ueber '@'), die Ausgrauung im Baum nicht.
   */
  inheritedExcluded(path: string): boolean {
    return vorfahren(path).some((a) => this.wirkungOf(a) === 'ausgeschlossen');
  }

  /**
   * Freigegebene Codelisten-Werte — Entscheidung, sonst Vorgabe. Ein leeres
   * Array ist eine explizite Einschraenkung („keine Werte zugelassen", siehe
   * isEmptyProfile) und faellt daher nicht auf die Vorgabe zurueck; nur ein
   * fehlender Eintrag tut das.
   */
  werteOf(path: string): string[] | null {
    return this.elemente()[path]?.werte ?? this.vorgabeProfileGeerbt(path)?.werte ?? null;
  }

  /**
   * Anmerkung — Entscheidung, sonst Vorgabe (dort der fachliche Hilfetext zum
   * Entscheidungspunkt). Ein leerer Text zaehlt wie keiner.
   */
  anmerkungOf(path: string): string | null {
    return this.elemente()[path]?.anmerkung || this.vorgabeProfileGeerbt(path)?.anmerkung || null;
  }

  /**
   * Beispielwert — Entscheidung, sonst Vorgabe. Im gebundenen Durchlauf ist der
   * Wert der Vorgabe ein Vorschlag, kein gesetzter Wert (Spec "vorschlagen statt
   * vorbelegen"); wer den Punkt beantwortet, schreibt in die Entscheidung.
   */
  beispielOf(path: string): string | null {
    return this.elemente()[path]?.beispiel || this.vorgabeBeispiel(path);
  }

  /** Verweisziel-Pfad (Z.1179-1183) — Entscheidung, sonst Vorgabe. */
  refZielOf(path: string): string | null {
    return this.elemente()[path]?.refZiel || this.vorgabeProfile(path)?.refZiel || null;
  }

  /** hasNotes (Z.1011-1014) — ueber die effektiven Lesezugriffe, also inkl. Vorgabe. */
  hasNotes(path: string): boolean {
    return !!(this.anmerkungOf(path) || this.beispielOf(path) || this.werteOf(path)?.length);
  }

  /**
   * Alle Praefixe eines Pfades an den Grenzen '/' UND '@' (ehemals
   * `ancestorPaths`, das nur '/' kannte und danach ohne Aufrufer zurueckblieb):
   * das schliesst den Traegerknoten einer Auspraegung ein, zu
   * `…/beteiligung@a1/rolle` gehoert also auch `…/beteiligung`. Ohne diesen
   * Knoten haengt der Ast im Baum in der Luft, denn die Auspraegungs-Kaesten
   * werden als seine Kinder gerendert (Praefix-Logik wie `HinweisStoreService.anc`).
   */

  /**
   * Pfade, die im "nur Werte"-Modus sichtbar bleiben: jedes Element mit Inhalt
   * (Beispielwert, Anmerkung, Codelisten-Werte, Hinweis) samt seiner Vorfahren,
   * damit der Weg von der Wurzel zu jedem Wert erhalten bleibt.
   */
  private readonly valuePaths = computed<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    const merke = (path: string): void => {
      set.add(path);
      for (const a of vorfahren(path)) set.add(a);
    };
    for (const [path, p] of Object.entries(this.elemente())) {
      if (!p || !(p.beispiel || p.anmerkung || (p.werte && p.werte.length))) continue;
      merke(path);
    }
    for (const pfad of this.hinweisStore.jePfad().keys()) merke(pfad);
    return set;
  });

  /** "nur Profil" blendet Ausgeschlossenes aus (renderBox Z.1211), "nur Werte" alles Wertlose. */
  boxHidden(path: string): boolean {
    if (this.onlyValues() && !this.valuePaths().has(path)) return true;
    // Gebundener Durchlauf: was die Profilierung ausschliesst, ist nicht
    // befuellbar und lenkt beim Befuellen nur ab — standardmaessig ausgeblendet,
    // ueber "nur Profil" nachzusehen (dort gesperrt, mit Begruendung). Der
    // Schalter bedeutet hier also "Ausgeschlossenes der Profilierung zeigen";
    // eigene Weglassen-Entscheidungen des Durchlaufs bleiben immer sichtbar,
    // sonst verschwaende der Klick auf "weglassen" den gerade bearbeiteten Ast.
    if (this.hatVorgabe()) return this.vorgabeGesperrt(path) && !this.onlyProfile();
    if (!this.onlyProfile()) return false;
    const st = this.statusOf(path);
    return st?.wirkung === 'ausgeschlossen' || this.inheritedExcluded(path);
  }

  /**
   * Betrachten <-> Bearbeiten einer geladenen Nachricht. Im Bearbeitungsmodus
   * wird "nur Werte" abgeschaltet: sonst blieben unbelegte Elemente unsichtbar
   * und liessen sich gar nicht erst befuellen — Angaben hinzufuegen waere
   * unmoeglich. Beim Zurueckschalten werden die belegten Aeste wieder
   * aufgeklappt (wie toggleOnlyValues in der Toolbar).
   */
  nachrichtBearbeiten(an: boolean): void {
    if (an && this.abnahmeSchreibschutz()) return;
    this.readOnly.set(!an);
    this.onlyValues.set(!an);
    if (!an) this.expandValueBranches();
  }

  /**
   * effKard (Z.1007-1010): effektive Kardinalitaet inkl. Override —
   * Entscheidung, sonst Vorgabe, sonst Schema (je Grenze getrennt).
   * `minProfil`/`maxProfil` sagen je Grenze, ob sie aus der Profilierung
   * stammt (statt aus dem Schema) — die Begruendung der Kardinalitaets-Sperren
   * im gefuehrten Durchlauf nennt die Quelle.
   *
   * Die Vorgabe wird ueber `vorgabeProfileGeerbt` gelesen, also mit Auflösung
   * des Vorkommen-Pfades: eine generisch eingegrenzte Kardinalitaet gilt in
   * jedem Vorkommen. Vorher stand hier der pfadgenaue Zugriff, wodurch die
   * Eingrenzung innerhalb einer benannten Auspraegung wirkungslos blieb — die
   * Anzeige nannte die Schema-Grenzen, die Mindestanzahl wurde nicht
   * materialisiert und die Hoechstanzahl nicht gesperrt (Issue #59). Der exakte
   * Eintrag gewinnt als Ganzes, nicht je Feld gemischt — dieselbe Regel wie bei
   * Werten und Anmerkungen.
   */
  effKard(node: TreeNode): {
    min: string;
    max: string;
    changed: boolean;
    minProfil: boolean;
    maxProfil: boolean;
  } {
    const p = this.elemente()[node.path] ?? {};
    const v = this.vorgabeProfileGeerbt(node.path);
    const minProfil = !!(p.min || v?.min);
    const maxProfil = !!(p.max || v?.max);
    return {
      min: p.min || v?.min || node.min,
      max: p.max || v?.max || node.max,
      changed: minProfil || maxProfil,
      minProfil,
      maxProfil,
    };
  }

  // ── Profil-Mutationen ───────────────────────────────────────────────

  /**
   * Merged `patch` in den Element-Eintrag und raeumt leere Eintraege weg
   * (kapselt pOf + pruneP, Z.987-996). Felder werden mit `undefined`
   * geloescht.
   */
  setElementProfile(path: string, patch: Partial<ElementProfile>): void {
    this.elemente.update((m) => {
      const merged: ElementProfile = { ...(m[path] ?? {}), ...patch };
      const next = { ...m, [path]: merged };
      if (this.isEmptyProfile(merged)) delete next[path];
      return next;
    });
  }

  /**
   * Belegt mehrere Pfade in einer einzigen Mutation mit `statusId` vor —
   * nicht-destruktiv: Pfade mit bereits gesetztem Status bleiben unangetastet,
   * vorhandene Felder werden erhalten. Gibt die Anzahl tatsaechlich gesetzter
   * Elemente zurueck (fuer die Zwingend-Vorbelegung der Pflichtelemente).
   */
  prefillStatus(paths: string[], statusId: string): number {
    let n = 0;
    this.elemente.update((m) => {
      const next = { ...m };
      for (const path of paths) {
        if (next[path]?.status) continue;
        next[path] = { ...(next[path] ?? {}), status: statusId };
        n++;
      }
      return n ? next : m;
    });
    return n;
  }

  /**
   * pruneP-Kriterium (Z.994). Ein leeres `werte`-Array ist eine explizite
   * Einschraenkung („keine Werte zugelassen") und macht das Profil nicht leer —
   * aufgehoben wird die Einschraenkung mit `werte: undefined`.
   */
  private isEmptyProfile(p: ElementProfile): boolean {
    return !p.status && !p.anmerkung && !p.beispiel && !p.min && !p.max && !p.refZiel && !p.werte;
  }

  /**
   * auspsOf (Z.1015) — Entscheidung, sonst Vorgabe. Der Rueckfall gilt je Pfad
   * fuer die ganze Liste: sobald der Durchlauf an einem Element eigene
   * Vorkommen fuehrt, sind sie massgeblich (kein Mischen beider Schichten).
   */
  auspsOf(path: string): Auspraegung[] | null {
    const sicht = this.vorgabeSicht();
    if (sicht) return sicht.auspsEffektiv(path);
    return this.auspraegungen()[path] ?? null;
  }

  /**
   * Alle Vorkommenslisten in der Lesart des Durchlaufs: die eigenen, ergaenzt um
   * die der gebundenen Fassung an Pfaden **ohne** eigene Liste (kein Mischen —
   * dieselbe Regel wie `auspsOf`). Fuer Konsumenten, die ueber *alle* Listen
   * laufen muessen (Verweisziele, Pflicht-Vorbelegung, Instanz-Export): ueber
   * die eigene Map allein blieben die Vorkommen der gebundenen Fassung
   * unsichtbar, solange der Durchlauf sie nicht angefasst hat (#28).
   */
  alleAuspListen(): [string, Auspraegung[]][] {
    return this.vorgabeSicht()?.alleListen() ?? Object.entries(this.auspraegungen());
  }

  /**
   * Startliste einer Listen-Mutation: die eigene Liste, sonst eine **Kopie** der
   * Liste der Vorgabe. Weil der Rueckfall von `auspsOf`/`erweiterungenOf` je
   * Pfad fuer die **ganze** Liste gilt, wuerde ein eigener Eintrag ohne diese
   * Materialisierung die Liste der gebundenen Fassung verdecken — die
   * zwingenden Vorkommen bzw. Erweiterungen der Profilierung verschwaenden aus
   * Baum und Instanz, und die Nachricht waere nicht mehr profilkonform.
   * Kopiert wird eintragsweise, damit spaetere Mutationen (`renameAusp` aendert
   * in place) die eingefrorene Fassung nicht anfassen; die eigene Liste behaelt
   * ihre Eintraege, damit ein ausgewaehltes Item konsistent bleibt.
   */
  private materialisiere<T extends object>(
    eigene: T[] | undefined,
    ausVorgabe: T[] | undefined,
  ): T[] {
    return eigene ? [...eigene] : (ausVorgabe ?? []).map((e) => ({ ...e }));
  }

  /**
   * Nach dem Entfernen: eine leergeraeumte **eigene** Liste bleibt als solche
   * stehen, solange die Vorgabe am Pfad eine Liste fuehrt — sonst griffe der
   * Rueckfall wieder und die entfernten Eintraege kaemen mit dem naechsten
   * Lesezugriff zurueck. Ohne Vorgabe faellt der Pfad wie bisher ganz weg.
   */
  private setzeListe<T>(map: Record<string, T[]>, path: string, rest: T[], vorgabe?: T[]): void {
    if (rest.length || vorgabe) map[path] = rest;
    else delete map[path];
  }

  /** addAusp (Z.1017-1022): haengt eine benannte Auspraegung an. */
  addAusp(path: string, name?: string): string {
    const id = 'a' + Date.now().toString(36) + ++this.auspN;
    this.auspraegungen.update((m) => {
      const list = this.materialisiere(m[path], this.vorgabeAusps(path) ?? undefined);
      list.push({ id, name: name || 'Ausprägung ' + (list.length + 1) });
      return { ...m, [path]: list };
    });
    return id;
  }

  /**
   * removeAusp (Z.1023-1035): entfernt eine Auspraegung und kaskadierend alle
   * darunter liegenden Profil-Eintraege und Unter-Ausprägungen; bereinigt
   * Auswahl und Oeffnungszustaende.
   */
  removeAusp(path: string, id: string): void {
    // Auch auf einer reinen Vorgabe-Liste (ueber `auspsOf`): benannte Vorkommen
    // der gebundenen Fassung sind entfernbar, **ausser** die Fassung setzt das
    // Vorkommen zwingend — diese Sperre huetet `GuidedService`
    // (`auspSperreEntfernen`), damit sie einen Grund nennen kann, statt hier
    // stillschweigend nichts zu tun. Der Store bleibt die mechanische Schicht
    // (#28, entschieden nach der Rueckstellung in #50).
    if (!this.auspsOf(path)?.some((a) => a.id === id)) return;
    const prefix = path + '@' + id;
    const vorgabeListe = this.vorgabeAusps(path) ?? undefined;

    this.auspraegungen.update((m) => {
      const next = { ...m };
      const rest = this.materialisiere(next[path], vorgabeListe).filter((a) => a.id !== id);
      this.setzeListe(next, path, rest, vorgabeListe);
      // Unter-Ausprägungen der entfernten Auspraegung wegraeumen.
      for (const k of Object.keys(next)) {
        if (unterPfad(k, prefix)) delete next[k];
      }
      return next;
    });

    this.elemente.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (unterPfad(k, prefix)) delete next[k];
      }
      return next;
    });

    this.erweiterungen.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (unterPfad(k, prefix)) delete next[k];
      }
      return next;
    });

    // Hinweise liegen in eigener Ablage, fallen aber mit dem Element: sonst
    // zaehlen sie weiter, stehen in der Uebersicht und erzeugen einen
    // Sammel-Marker, dessen Sprung ins Leere geht. Der Aufruf gehoert hierher
    // und nicht an die Bedienstellen — die Invariante haengt an der Kaskade,
    // nicht am Knopf.
    void this.hinweisStore.loescheUnter(prefix);

    const sel = this.selItem();
    if (sel && unterPfad(itemPath(sel), prefix)) this.selItem.set(null);

    this.open.update((s) => {
      const next = new Set(s);
      for (const p of s) if (unterPfad(p, prefix)) next.delete(p);
      return next;
    });
  }

  // ── Schema-Erweiterungen ────────────────────────────────────────────

  /**
   * erweiterungenOf — Entscheidung, sonst Vorgabe. Wie `auspsOf` gilt der
   * Rueckfall je Elternpfad fuer die ganze Liste. Im gebundenen Durchlauf sind
   * die Schema-Erweiterungen der Profilierung damit regulaerer Teil des Baums:
   * sie werden befuellt wie jedes andere Element (Spec "Testnachricht aus einer
   * Profilierung" — sonst fehlten zwingend gesetzte Elemente und die Nachricht
   * waere nicht profilkonform).
   */
  erweiterungenOf(parentPath: string): Erweiterung[] | null {
    return this.erweiterungen()[parentPath] ?? this.vorgabe()?.erweiterungen[parentPath] ?? null;
  }

  /**
   * Namen aller bekannten Schema-Erweiterungen — aus dem Entscheidungsstand und
   * aus der gebundenen Fassung. Im gebundenen Durchlauf stammen die
   * Erweiterungen aus der Profilierung; ohne diese Schicht hielte die
   * Validierung deren Fehler faelschlich fuer echte Schemaverstoesse.
   */
  readonly erweiterungsNamen = computed<ReadonlySet<string>>(() => {
    const namen = new Set<string>();
    for (const quelle of [this.erweiterungen(), this.vorgabe()?.erweiterungen ?? {}])
      for (const liste of Object.values(quelle)) for (const e of liste) namen.add(e.name);
    return namen;
  });

  /** Haengt eine Schema-Erweiterung unter `parentPath` an (Muster addAusp). */
  addErweiterung(parentPath: string, daten: Omit<Erweiterung, 'id'>): string {
    const id = 'x' + Date.now().toString(36) + ++this.erwN;
    this.erweiterungen.update((m) => {
      const list = this.materialisiere(m[parentPath], this.vorgabe()?.erweiterungen[parentPath]);
      list.push({ ...daten, id });
      return { ...m, [parentPath]: list };
    });
    return id;
  }

  updateErweiterung(parentPath: string, id: string, patch: Partial<Omit<Erweiterung, 'id'>>): void {
    this.erweiterungen.update((m) => {
      // Nur auf einer eigenen Liste (siehe removeAusp): die Erweiterungen der
      // gebundenen Fassung sind hier nicht editierbar.
      if (!m[parentPath]) return m;
      const list = this.materialisiere(m[parentPath], undefined);
      return { ...m, [parentPath]: list.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
    });
  }

  /**
   * Entfernt eine Schema-Erweiterung und kaskadierend alle Profil-Eintraege,
   * Auspraegungen und Unter-Erweiterungen darunter (Muster removeAusp).
   */
  removeErweiterung(parentPath: string, id: string): void {
    // Nur auf einer eigenen Liste — wie removeAusp; eine reine Vorgabe-Liste
    // bleibt unberuehrt.
    if (!this.erweiterungen()[parentPath]?.some((e) => e.id === id)) return;
    const prefix = parentPath + '/~' + id;
    const betroffen = (k: string): boolean => unterPfad(k, prefix);
    const vorgabeListe = this.vorgabe()?.erweiterungen[parentPath];

    this.erweiterungen.update((m) => {
      const next = { ...m };
      const rest = this.materialisiere(next[parentPath], vorgabeListe).filter((e) => e.id !== id);
      this.setzeListe(next, parentPath, rest, vorgabeListe);
      for (const k of Object.keys(next)) if (betroffen(k)) delete next[k];
      return next;
    });

    this.elemente.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) if (betroffen(k)) delete next[k];
      return next;
    });

    this.auspraegungen.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) if (betroffen(k)) delete next[k];
      return next;
    });

    // Wie in removeAusp: die Hinweise des Teilbaums fallen mit.
    void this.hinweisStore.loescheUnter(prefix);

    const sel = this.selItem();
    if (sel && itemPath(sel).startsWith(prefix)) this.selItem.set(null);

    this.open.update((s) => {
      const next = new Set(s);
      for (const p of s) if (p.startsWith(prefix)) next.delete(p);
      return next;
    });
  }

  // ── Oeffnungszustaende ──────────────────────────────────────────────

  isOpen(path: string): boolean {
    return this.open().has(path);
  }

  toggleOpen(path: string): void {
    this.open.update((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  setOpen(path: string, open: boolean): void {
    this.open.update((s) => {
      if (s.has(path) === open) return s;
      const next = new Set(s);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  /**
   * Klappt einen Teilbaum komplett zu: der Knoten selbst und alle
   * Nachfahren-Pfade (Kinder `/` und Auspraegungen `@`) fliegen aus `open`.
   * Ein Signal-Set (Kontextmenue "Alle Kinder einklappen").
   */
  closeSubtree(path: string): void {
    this.open.update((s) => {
      let next: Set<string> | null = null;
      for (const p of s)
        if (unterPfad(p, path)) {
          next ??= new Set(s);
          next.delete(p);
        }
      return next ?? s;
    });
  }

  /**
   * Klappt alle Äste auf, die im "nur Werte"-Modus sichtbar bleiben (jeder Wert
   * samt seiner Vorfahren). Sonst wirkt der Filter nur innerhalb bereits
   * geöffneter Äste; so wird die belegte Nachricht in einem Schritt aufgedeckt.
   */
  expandValueBranches(): void {
    const paths = this.valuePaths();
    if (!paths.size) return;
    this.open.update((s) => {
      const next = new Set(s);
      for (const p of paths) next.add(p);
      return next;
    });
  }

  // ── Status-Konfiguration & Profil-Lebenszyklus ──────────────────────

  setStatuses(statuses: Status[]): void {
    this.statuses.set(statuses);
  }

  patchMeta(patch: Partial<ProfileMeta>): void {
    this.meta.update((m) => ({ ...m, ...patch }));
  }

  /** Setzt das Profil komplett neu (loadProfile). */
  loadProfile(doc: ProfileDoc): void {
    // Validierungsmarker beziehen sich auf den letzten Prueflauf des vorherigen
    // Profils/Baums — jeder Profil-Einstieg (auch loadMessage → resetProfile,
    // fortsetzen, restore nach transienter Generierung) raeumt sie.
    this.clearValidierungsMarker();
    this.meta.set(doc.meta ?? {});
    this.statuses.set(doc.statuses ?? newProfile().statuses);
    this.elemente.set(doc.elemente ?? {});
    this.auspraegungen.set(doc.auspraegungen ?? {});
    this.erweiterungen.set(doc.erweiterungen ?? {});
    this.selItem.set(null);
    this.open.set(new Set());
    // Jeder Profil-Einstieg ist editierbar und zeigt den vollen Standard; der
    // Betrachtungsmodus wird nur beim Nachrichten-Import (importXml) eingeschaltet.
    this.readOnly.set(false);
    this.onlyValues.set(false);
    // Eine evtl. laufende Nachrichten-Bearbeitung/-Erstellung endet mit dem
    // Profil-Wechsel; importXml bzw. TestmessageCreateService setzen ihre
    // Session danach neu.
    this.messageEdit.set(null);
    this.messageCreate.set(null);
    // Die Vorgabe gehoert zum Durchlauf, nicht zum Dokument: mit dem
    // Profil-Einstieg endet die Bindung. Die Einstiege, die gebunden fuehren,
    // setzen sie danach explizit (wie messageCreate).
    this.clearVorgabe();
    // Die reine Schema-Ansicht endet mit jedem Profil-Einstieg; bei der
    // Nachrichtenwahl innerhalb der Schema-Ansicht stellt loadMessage sie
    // danach wieder her.
    this.schemaView.set(false);
    // `guided` bleibt hier bewusst unangetastet: loadProfile laeuft auch bei der
    // Nachrichtenwahl innerhalb eines gefuehrten neuen Profils (loadMessage →
    // resetProfile). Die Einstiege setzen den Modus explizit (createNew: an;
    // openFromLibrary/importXml: aus).
  }

  /** Frisches, leeres Profil (newProfile). */
  resetProfile(): void {
    this.loadProfile(newProfile());
  }

  // ── Ausprägungs-Nummern / -Label ────────────────────────────────────

  /** auspNumber (Z.626-633): 1-basierte Nummer einer Auspraegung. */
  auspNumber(auspPath: string): number | null {
    const teile = auspTeile(auspPath);
    if (!teile) return null;
    const list = this.auspsOf(teile.listPfad);
    if (!list) return null;
    const idx = list.findIndex((a) => a.id === teile.auspId);
    return idx >= 0 ? idx + 1 : null;
  }

  /** auspLabel (Z.634-640): "Element „Name"" fuer ein Verweisziel. */
  auspLabel(auspPath: string): string {
    const teile = auspTeile(auspPath);
    // '@' im Pfadinneren, aber nicht im letzten Segment: kein Vorkommens-Pfad —
    // wie frueher als geloeschtes Ziel ausweisen, nicht als roher Pfad.
    if (!teile) return auspPath.includes('@') ? '(gelöschtes Ziel)' : auspPath;
    const a = (this.auspsOf(teile.listPfad) ?? []).find((x) => x.id === teile.auspId);
    return a ? pretty(blattName(teile.listPfad)) + ' „' + a.name + '"' : '(gelöschtes Ziel)';
  }

  // ── Duplizieren (Z.1393-1434) ───────────────────────────────────────

  private moveSubProfile(fromPrefix: string, toPrefix: string): void {
    this.elemente.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (k.startsWith(fromPrefix)) {
          next[toPrefix + k.slice(fromPrefix.length)] = next[k]!;
          delete next[k];
        }
      }
      return next;
    });
    this.auspraegungen.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (k.startsWith(fromPrefix)) {
          next[toPrefix + k.slice(fromPrefix.length)] = next[k]!;
          delete next[k];
        }
      }
      return next;
    });
    // Erweiterungen sind am Elternpfad indiziert: direkt unter der Basis
    // liegende Erweiterungen stehen am Basis-Pfad selbst (ohne '/').
    const fromBase = fromPrefix.replace(/\/$/, '');
    const toBase = toPrefix.replace(/\/$/, '');
    this.erweiterungen.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (k === fromBase || k.startsWith(fromPrefix)) {
          next[toBase + k.slice(fromBase.length)] = next[k]!;
          delete next[k];
        }
      }
      return next;
    });
  }

  private copySubProfile(fromPrefix: string, toPrefix: string): void {
    this.elemente.update((m) => {
      const next = { ...m };
      for (const [k, v] of Object.entries(m)) {
        if (k.startsWith(fromPrefix)) {
          next[toPrefix + k.slice(fromPrefix.length)] = {
            ...v,
            werte: v.werte ? [...v.werte] : undefined,
          };
        }
      }
      return next;
    });
    this.auspraegungen.update((m) => {
      const next = { ...m };
      for (const [k, v] of Object.entries(m)) {
        if (k.startsWith(fromPrefix)) {
          next[toPrefix + k.slice(fromPrefix.length)] = v.map((a) => ({ ...a }));
        }
      }
      return next;
    });
    // Wie in moveSubProfile: Erweiterungen an der Basis selbst mitnehmen.
    const fromBase = fromPrefix.replace(/\/$/, '');
    const toBase = toPrefix.replace(/\/$/, '');
    this.erweiterungen.update((m) => {
      const next = { ...m };
      for (const [k, v] of Object.entries(m)) {
        if (k === fromBase || k.startsWith(fromPrefix)) {
          next[toBase + k.slice(fromBase.length)] = v.map((e) => ({ ...e }));
        }
      }
      return next;
    });
  }

  /** duplicateElement (Z.1416-1424): wiederholbares Element als Faelle fuehren. */
  duplicateElement(path: string): void {
    const ausps = this.auspsOf(path);
    if (ausps && ausps.length) {
      this.addAusp(path, 'Fall ' + (ausps.length + 1));
      this.setOpen(path, true);
      return;
    }
    const id1 = this.addAusp(path, 'Fall 1');
    this.moveSubProfile(path + '/', path + '@' + id1 + '/');
    this.addAusp(path, 'Fall 2');
    this.setOpen(path, true);
  }

  /**
   * renameAusp: Namen einer Auspraegung aendern. Mutiert den Namen in place
   * (damit ein evtl. ausgewaehltes Item konsistent bleibt) und setzt eine neue
   * Array-Referenz, damit das Signal feuert.
   */
  renameAusp(listPath: string, id: string, name: string): void {
    const clean = name.trim();
    this.auspraegungen.update((m) => {
      // Auch auf einer Vorgabe-Liste (siehe removeAusp): das Umbenennen
      // materialisiert sie und laesst die eingefrorene Fassung unberuehrt.
      const vorgabeListe = this.vorgabeAusps(listPath) ?? undefined;
      if (!m[listPath] && !vorgabeListe) return m;
      const list = this.materialisiere(m[listPath], vorgabeListe);
      const a = list.find((x) => x.id === id);
      if (a && clean) a.name = clean;
      return { ...m, [listPath]: list };
    });
  }

  /**
   * refZielKandidaten (Z.616-624): moegliche Verweisziele fuer eine Ref-Art.
   *
   * `beschraenkung` ist das von der **Profilierung** festgelegte Verweisziel:
   * ein Vorkommen-Pfad, auf den die Auswahl eingeengt wird — zulaessig bleiben
   * dieses Vorkommen und seine Kopien (`vonId`), also die Vorkommen **derselben
   * Auspraegung** (Spec #30). Ohne Festlegung bleibt die Liste voll.
   *
   * Die Beschriftung nennt die Nummer des Vorkommens, damit mehrere Vorkommen
   * derselben Auspraegung unterscheidbar sind.
   */
  refZielKandidaten(
    kind: string,
    beschraenkung?: string | null,
  ): { path: string; label: string }[] {
    const names = REF_TARGETS[kind] ?? null;
    const out: { path: string; label: string }[] = [];
    const grenze = beschraenkung ? auspTeile(beschraenkung) : null;
    const grenzeListe = grenze?.listPfad ?? '';
    const grenzeId = grenze?.auspId ?? '';
    // Ueber die effektive Lesart: im gebundenen Durchlauf stehen die Vorkommen
    // in der Vorgabe, solange der Durchlauf sie nicht angefasst hat — sonst
    // kennte `auspLabel` ein Ziel, das die Kandidatenliste nicht anbietet (#28).
    for (const [path, list] of this.alleAuspListen()) {
      const elName = blattName(path);
      if (names && !names.includes(elName)) continue;
      if (beschraenkung && path !== grenzeListe) continue;
      list.forEach((a, i) => {
        if (beschraenkung && a.id !== grenzeId && a.vonId !== grenzeId) return;
        out.push({
          path: path + '@' + a.id,
          label: pretty(elName) + ' → ' + a.name + ' (Vorkommen ' + (i + 1) + ')',
        });
      });
    }
    return out;
  }

  // ── Status-Konfiguration (openStatusDlg, Z.1669-1702) ───────────────

  addStatus(): void {
    this.statuses.update((l) => [
      ...l,
      {
        id: 's' + Date.now().toString(36),
        name: 'neuer Status',
        farbe: '#378ADD',
        wirkung: 'markierung',
      },
    ]);
  }

  updateStatus(id: string, patch: Partial<Status>): void {
    this.statuses.update((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  statusUsed(id: string): boolean {
    return Object.values(this.elemente()).some((p) => p.status === id);
  }

  /** Status loeschen; betroffene Elemente fallen auf "wie Standard" zurueck. */
  removeStatus(id: string): void {
    this.statuses.update((l) => l.filter((s) => s.id !== id));
    this.elemente.update((m) => {
      const next = { ...m };
      for (const [k, v] of Object.entries(next)) {
        if (v.status === id) {
          const cleaned: ElementProfile = { ...v };
          delete cleaned.status;
          if (this.isEmptyProfile(cleaned)) delete next[k];
          else next[k] = cleaned;
        }
      }
      return next;
    });
  }

  /** copyAusp (Z.1425-1434): Auspraegung samt Unter-Profilierung kopieren. */
  copyAusp(parentPath: string, auspId: string): void {
    // Quelle auch dann, wenn sie nur in der gebundenen Fassung steht: im
    // Durchlauf entstehen weitere Vorkommen als Kopie einer **profilierten**
    // Auspraegung, und die bleibt waehlbar, nachdem sie aus der eigenen Liste
    // entfernt wurde (#28).
    const src =
      this.auspsOf(parentPath)?.find((a) => a.id === auspId) ??
      this.vorgabeAusps(parentPath)?.find((a) => a.id === auspId);
    if (!src) return;
    const nid = this.addAusp(parentPath, src.name + ' (Kopie)');
    // Herkunft flach halten: die Kopie einer Kopie zeigt auf dieselbe
    // profilierte Auspraegung, sonst muesste jeder Lesezugriff eine Kette
    // aufloesen.
    const vonId = src.vonId ?? auspId;
    this.auspraegungen.update((m) => {
      const list = (m[parentPath] ?? []).map((a) => (a.id === nid ? { ...a, vonId } : a));
      return { ...m, [parentPath]: list };
    });
    const from = parentPath + '@' + auspId;
    const to = parentPath + '@' + nid;
    const fromProfile = this.elemente()[from];
    if (fromProfile) this.setElementProfile(to, { ...fromProfile });
    this.copySubProfile(from + '/', to + '/');
    this.setOpen(parentPath, true);
  }
}
