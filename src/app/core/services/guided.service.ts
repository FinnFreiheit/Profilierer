import { Injectable, Signal, computed, inject } from '@angular/core';
import { TreeNode, itemPath } from '../../models/node.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';
import { DispositionService } from './disposition.service';
import { PlaceholderNode, ValueService } from './value.service';

/**
 * Kennzeichnung eines Punkts im **gebundenen** Durchlauf, abgeleitet aus der
 * Aussage der Profilierung (nicht aus der Entscheidung des Anwenders):
 *
 * - `zuklaeren` — die Profilierung traegt hier eine reine Markierung: der Punkt
 *   verhaelt sich wie ein optionaler, die fachliche Frage ist aber noch offen.
 * - `nichtprofiliert` — die Profilierung sagt zu diesem Element nichts. Es folgt
 *   der Schema-Semantik; die Testnachricht geht insoweit ueber das Szenario
 *   hinaus (offene Welt, siehe Spec "Testnachricht aus einer Profilierung").
 */
export type PunktMarker = 'zuklaeren' | 'nichtprofiliert';

/**
 * Ein Entscheidungspunkt des gefuehrten Durchlaufs. Im Profil-Modus: ein
 * Element/eine Gruppe/eine Auspraegung, zu der eine Disposition zu treffen ist.
 * Im Instanz-Modus (Testnachricht gefuehrt erstellen) zusaetzlich `wert`:
 * ein Pflicht-Blatt, das einen typkonformen Wert braucht.
 */
export interface DecisionPoint {
  path: string;
  art: 'element' | 'auswahl' | 'auspraegung' | 'wert';
  /** Position in Dokumentreihenfolge (DFS ueber den Schema-Baum). */
  seq: number;
  /** Instanz-Modus: Punkt ist ein Blatt (braucht einen Wert, wenn vorhanden). */
  leaf?: boolean;
  /** Instanz-Modus: unbedingte Pflicht (min>=1, nicht in einer Auswahl). */
  pflicht?: boolean;
  /** Auswahl-Schritt: Pfade der Zweige (fuer die Genau-ein-Zweig-Regel). */
  kinder?: string[];
  /** Gebundener Durchlauf: Kennzeichnung aus der Aussage der Profilierung. */
  marker?: PunktMarker;
  /** Synthetischer Knoten (choice-/sequence-Gruppe) — kein Element der Nachricht. */
  synthetisch?: boolean;
}

/** Ergebnis des Struktur-Walks (Punkte + Positionsindex + Blatt-Infos). */
interface WalkErgebnis {
  punkte: DecisionPoint[];
  seqOf: Map<string, number>;
  /** Blatt-Punkte: Infos fuer Wert-Pruefung und Dummy-Befuellung. */
  wertNodes: Map<string, PlaceholderNode>;
}

/**
 * Gefuehrte Fuehrungs- und Zaehlschicht ueber dem Profil-Modell — in zwei Modi:
 *
 * **Profil-Modus** (US "Profilierung gefuehrt erstellen"): je Punkt eine
 * Disposition (zwingend / anzugeben wenn vorhanden / nicht verwendet).
 *
 * **Instanz-Modus** (US "Testnachricht gefuehrt erstellen", aktiv bei laufender
 * `messageCreate`- oder `messageEdit`-Session): dieselbe Punkte-Mechanik, aber
 * mit Instanz-Semantik —
 * - Pflicht-Blaetter sind `wert`-Punkte (offen, bis ein typkonformer Wert da ist),
 * - optionale Elemente entscheiden **aufnehmen** (Wirkung `pflicht`) oder
 *   **weglassen** (`ausgeschlossen`); abgestiegen wird nur in Aufgenommenes
 *   (bzw. in Aeste, die bereits Inhalt tragen — Nachrichten-Bearbeitung),
 * - eine Auswahl (`choice`) verlangt **genau einen** Zweig je Vorkommen,
 * - Auspraegungen sind die Vorkommen wiederholbarer Elemente.
 *
 * Reaktivitaet: Im Profil-Modus haengt der teure Struktur-Walk nur an
 * root/auspraegungen und einem Ausschluss-Fingerprint; im Instanz-Modus
 * zusaetzlich an `elemente` (Aufnahme/Inhalt steuern den Abstieg).
 */
@Injectable({ providedIn: 'root' })
export class GuidedService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly nav = inject(NavService);
  private readonly disposition = inject(DispositionService);
  private readonly values = inject(ValueService);

  /** Instanz-Modus: eine Nachricht (statt eines Profils) wird gefuehrt befuellt. */
  readonly instanzModus = computed<boolean>(
    () => !!this.state.messageCreate() || !!this.state.messageEdit(),
  );

  /** Sortierter Fingerprint aller ausgeschlossenen Pfade (Struktur-Invalidierung). */
  private readonly exclKey = computed<string>(() => {
    const excl: string[] = [];
    for (const [path, p] of Object.entries(this.state.elemente())) {
      if (!p.status) continue;
      if (this.state.statusById(p.status)?.wirkung === 'ausgeschlossen') excl.push(path);
    }
    return excl.sort().join('\n');
  });

  /** Struktur-Walk: Entscheidungspunkte + Positionsindex (memoisiert). */
  private readonly walk = computed<WalkErgebnis>(() => {
    const root = this.state.root();
    this.state.auspraegungen(); // getrackte Abhaengigkeit (Auspraegungs-Struktur)
    this.state.vorgabe(); // dito: die gebundene Fassung schneidet Aeste ab
    const instanz = this.instanzModus();
    // Instanz-Modus: Aufnahme-Wirkungen und Inhalte steuern den Abstieg.
    if (instanz) this.state.elemente();
    const excl = new Set(this.exclKey() ? this.exclKey().split('\n') : []);
    // Gebundener Durchlauf: was die Vorgabe ausschliesst, ist gar kein
    // Entscheidungspunkt — der Ast wird vor dem Punkt abgeschnitten (anders als
    // eine eigene Weglassen-Entscheidung, die als getroffene Entscheidung
    // sichtbar bleibt).
    const gesperrt = (path: string): boolean => this.state.vorgabeSchliesstAus(path);
    // Zwingend gesetzt: die gebundene Fassung verlangt das Element, auch wo das
    // Schema es freistellt. Es ist damit kein Aufnehmen/Weglassen-Punkt mehr,
    // sondern Pflicht-Rueckgrat — Blaetter brauchen einen typkonformen Wert,
    // Container werden ohne Rueckfrage betreten. Wie der Marker ueber
    // profilWirkungGeerbt, damit die Festlegung auch innerhalb eines Vorkommens
    // greift — sonst verlangte der Durchlauf am Traegerelement, was er in der
    // Auspraegung wieder freigibt.
    const zwingend = (path: string): boolean =>
      instanz && this.state.profilWirkungGeerbt(path) === 'pflicht';
    const punkte: DecisionPoint[] = [];
    const seqOf = new Map<string, number>();
    const wertNodes = new Map<string, PlaceholderNode>();
    if (!root) return { punkte, seqOf, wertNodes };
    let seq = 0;

    // Pfade, unter denen bereits Inhalt liegt (Werte/Auspraegungen) — im
    // Instanz-Modus wird in solche Aeste auch ohne Aufnahme-Wirkung abgestiegen
    // (Nachrichten-Bearbeitung: vorhandener Inhalt hat keine Wirkungen).
    const inhalt = new Set<string>();
    if (instanz) {
      const merke = (path: string): void => {
        const segs = path.split('/');
        let cur = '';
        for (const sg of segs) {
          cur = cur ? cur + '/' + sg : sg;
          inhalt.add(cur);
          const at = sg.lastIndexOf('@');
          if (at >= 0) inhalt.add(cur.slice(0, cur.length - (sg.length - at)));
        }
      };
      for (const [path, p] of Object.entries(this.state.elemente())) {
        if (p.beispiel) merke(path);
      }
      for (const path of Object.keys(this.state.auspraegungen())) merke(path);
    }

    const merkeWertNode = (n: TreeNode, path: string): void => {
      wertNodes.set(path, { name: n.name, path, typeName: n.typeName, codelist: n.codelist });
    };

    /** Instanz-Modus: in dieses (optionale/Auswahl-)Kind absteigen? */
    const steigAb = (path: string): boolean =>
      this.state.wirkungOf(path) === 'pflicht' || inhalt.has(path);

    const kinderPfade = (n: TreeNode): string[] => (n.children ?? []).map((c) => c.path);

    const visit = (n: TreeNode, depth: number): void => {
      if (depth > 30) return;
      if (gesperrt(n.path)) return; // Vorgabe schliesst aus: kein Punkt, kein Abstieg
      if (n.synthetic) {
        seqOf.set(n.path, seq++);
        if (n.model === 'choice') {
          this.tree.expandNode(n);
          // Auswahl-Schritt: immer genau ein Punkt.
          punkte.push({
            path: n.path,
            art: 'auswahl',
            seq: seqOf.get(n.path)!,
            pflicht: n.min !== '0' && !n.inChoice,
            kinder: instanz ? kinderPfade(n) : undefined,
            synthetisch: true,
          });
        } else if (n.min === '0' && !zwingend(n.path)) {
          // Optionale Gruppe: eigener Punkt, sonst blieben ihre Pflicht-Kinder unentschieden.
          punkte.push({
            path: n.path,
            art: 'element',
            seq: seqOf.get(n.path)!,
            synthetisch: true,
          });
        }
        if (excl.has(n.path)) return; // abgeschnitten
        for (const c of this.tree.kinder(n)) {
          // Instanz: nur in gewaehlte Zweige bzw. aufgenommene optionale Gruppen.
          if (instanz && n.model === 'choice' && !steigAb(c.path)) continue;
          if (instanz && n.model !== 'choice' && n.min === '0' && !steigAb(n.path)) continue;
          visit(c, depth + 1);
        }
        return;
      }

      seqOf.set(n.path, seq++);
      const optional = (n.min === '0' && !zwingend(n.path)) || n.inChoice;
      const leaf = this.tree.isLeaf(n);
      const istChoiceEl = !leaf && !n.recursive && (this.tree.expandNode(n), n.model === 'choice');

      if (instanz) {
        if (istChoiceEl) {
          // Benanntes auswahl_*-Element: der Auswahl-Schritt liegt am Element.
          punkte.push({
            path: n.path,
            art: 'auswahl',
            seq: seqOf.get(n.path)!,
            pflicht: !optional,
            kinder: kinderPfade(n),
          });
        } else if (n.inChoice) {
          // Zweig einer Auswahl: die Entscheidung faellt am Auswahl-Schritt;
          // ein gewaehlter Blatt-Zweig braucht (wie Pflicht) einen Wert.
          // Besucht wird er ohnehin nur, wenn gewaehlt bzw. mit Inhalt.
          if (leaf) {
            punkte.push({
              path: n.path,
              art: 'wert',
              seq: seqOf.get(n.path)!,
              leaf: true,
              pflicht: true,
            });
            merkeWertNode(n, n.path);
          }
        } else if (optional) {
          punkte.push({ path: n.path, art: 'element', seq: seqOf.get(n.path)!, leaf });
          if (leaf) merkeWertNode(n, n.path);
        } else if (leaf) {
          // Unbedingtes Pflicht-Blatt: Wert noetig.
          punkte.push({
            path: n.path,
            art: 'wert',
            seq: seqOf.get(n.path)!,
            leaf: true,
            pflicht: true,
          });
          merkeWertNode(n, n.path);
        }
      } else {
        if (optional) punkte.push({ path: n.path, art: 'element', seq: seqOf.get(n.path)! });
      }

      if (excl.has(n.path)) return; // abgeschnitten
      if (n.recursive) return;
      // Instanz: in nicht aufgenommene optionale Teilbaeume nicht absteigen —
      // ihre Punkte entstehen erst mit der Aufnahme.
      if (instanz && optional && !istChoiceEl && !steigAb(n.path)) return;

      const ausps = this.state.auspsOf(n.path);
      if (ausps && ausps.length) {
        // Auspraegungen ersetzen den generischen Unterbaum (wie walkFull/childItems).
        for (const a of ausps) {
          const cn = this.tree.ctxNode(n, a.id);
          if (gesperrt(cn.path)) continue; // ausgeschlossenes Vorkommen der Vorgabe
          seqOf.set(cn.path, seq++);
          const cnLeaf = this.tree.isLeaf(cn);
          const cnChoice =
            !cnLeaf && !cn.recursive && (this.tree.expandNode(cn), cn.model === 'choice');
          if (instanz && cnChoice) {
            // Je Vorkommen ein eigener Auswahl-Schritt (verschiedene Zweige moeglich).
            punkte.push({
              path: cn.path,
              art: 'auswahl',
              seq: seqOf.get(cn.path)!,
              pflicht: true,
              kinder: kinderPfade(cn),
            });
          } else {
            punkte.push({
              path: cn.path,
              art: 'auspraegung',
              seq: seqOf.get(cn.path)!,
              leaf: cnLeaf,
            });
            if (instanz && cnLeaf) merkeWertNode(cn, cn.path);
          }
          if (excl.has(cn.path)) continue;
          for (const c of this.tree.kinder(cn)) {
            if (instanz && cnChoice && !steigAb(c.path)) continue;
            visit(c, depth + 2);
          }
        }
        return;
      }

      // Schema-Erweiterungen haengen auch an Blaettern (`kinder` fuehrt sie mit);
      // in den Schema-Unterbau steigt nur ab, wer keines ist.
      for (const c of this.tree.kinder(n)) {
        if (leaf && !c.erweiterung) continue;
        if (instanz && istChoiceEl && !steigAb(c.path)) continue;
        visit(c, depth + 1);
      }
    };

    // Wurzel implizit: Start bei den Kindern der Nachricht.
    seqOf.set(root.path, seq++);
    for (const c of this.tree.kinder(root)) visit(c, 1);
    // Gebundener Durchlauf: jeden Punkt mit der Aussage der Profilierung
    // kennzeichnen ("zu klaeren" / "nicht profiliert").
    for (const p of punkte) {
      const m = this.markerOf(p.path);
      if (m) p.marker = m;
    }
    return { punkte, seqOf, wertNodes };
  });

  /**
   * Kennzeichnung eines Pfades aus Sicht der gebundenen Profilfassung — die
   * Aussage des Profils, nicht die Antwort des Anwenders: sie bleibt stehen,
   * auch nachdem der Durchlauf entschieden hat. Ohne Bindung (und ausserhalb des
   * Instanz-Modus) gibt es keine Marker. "Festlegung" heisst gesetzte
   * Statusstufe: ein Eintrag, der nur Anmerkung oder Beispielwert traegt, ist
   * keine Aussage ueber die Verwendung und zaehlt als "nicht profiliert".
   */
  markerOf(path: string): PunktMarker | null {
    if (!this.instanzModus() || !this.state.hatVorgabe()) return null;
    if (this.state.vorgabeGesperrt(path)) return null; // gesperrt traegt seinen eigenen Marker
    const w = this.state.profilWirkungGeerbt(path);
    if (w === 'markierung') return 'zuklaeren';
    return w ? null : 'nichtprofiliert';
  }

  /** Alle Entscheidungspunkte in Dokumentreihenfolge. */
  readonly punkte: Signal<DecisionPoint[]> = computed(() => this.walk().punkte);

  /** Offene (unentschiedene) Punkt-Pfade — O(1)-Lookup fuer den Baum. */
  readonly offeneSet: Signal<ReadonlySet<string>> = computed(() => {
    const set = new Set<string>();
    for (const p of this.walk().punkte) {
      if (!this.istEntschiedenPunkt(p)) set.add(p.path);
    }
    return set;
  });

  /** Fortschritt: X entschiedene von Y echten Nutzer-Entscheidungen. */
  readonly fortschritt: Signal<{ x: number; y: number }> = computed(() => {
    const y = this.walk().punkte.length;
    return { x: y - this.offeneSet().size, y };
  });

  /**
   * Instanz-Modus: Anzahl offener Punkte, die die Schema-Vollstaendigkeit
   * verletzen (leere/typwidrige Pflichtwerte, ungeloeste Pflicht-Auswahlen,
   * aufgenommene Blaetter ohne Wert) — das "valide"-Kriterium der Story.
   * Offene reine Aufnahme-Entscheidungen zaehlen hier nicht.
   */
  readonly offenePflicht: Signal<number> = computed(() => {
    if (!this.instanzModus()) return 0;
    let n = 0;
    for (const p of this.walk().punkte) {
      if (this.istEntschiedenPunkt(p)) continue;
      if (this.istKritisch(p)) n++;
    }
    return n;
  });

  /**
   * Gebundener Durchlauf: wie viele **beruehrte** Elemente ungeklaert bzw. nicht
   * profiliert sind — die Sammelmeldung beim Speichern (Spec "Testnachricht aus
   * einer Profilierung"). Beruehrt heisst: das Element landet in der Nachricht.
   * Ein optionaler Punkt zaehlt also erst mit der Aufnahme, Weggelassenes nie.
   * Synthetische Gruppen (choice/sequence) bleiben aussen vor — sie sind keine
   * Elemente der Nachricht, sondern Schema-Partikel.
   */
  readonly markerZaehlung: Signal<{ ungeklaert: number; nichtProfiliert: number }> = computed(
    () => {
      let ungeklaert = 0;
      let nichtProfiliert = 0;
      for (const p of this.walk().punkte) {
        if (p.synthetisch || !p.marker || !this.istEnthalten(p)) continue;
        if (p.marker === 'zuklaeren') ungeklaert++;
        else nichtProfiliert++;
      }
      return { ungeklaert, nichtProfiliert };
    },
  );

  /** Landet dieser Punkt in der erzeugten Nachricht? */
  private istEnthalten(p: DecisionPoint): boolean {
    const w = this.state.wirkungOf(p.path);
    if (w === 'ausgeschlossen') return false;
    // Optionales ist erst mit der Aufnahme Teil der Nachricht; alles andere hat
    // der Walk nur besucht, weil es auf dem Pflicht-/gewaehlten Weg liegt.
    return p.art === 'element' ? w === 'pflicht' : true;
  }

  /** Deduplizierte Freitexte (anmerkung) des Profils — als Vorschlaege wiederverwendbar. */
  readonly anmerkungVorschlaege: Signal<string[]> = computed(() => {
    const set = new Set<string>();
    for (const p of Object.values(this.state.elemente())) {
      const t = p.anmerkung?.trim();
      if (t) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  });

  /** Ist der Pfad ein Entscheidungspunkt des Durchlaufs? */
  istPunkt(path: string): boolean {
    return this.walk().punkte.some((p) => p.path === path);
  }

  /** Der Entscheidungspunkt zu einem Pfad (null, wenn keiner). */
  punktAt(path: string): DecisionPoint | null {
    return this.walk().punkte.find((p) => p.path === path) ?? null;
  }

  /** Entschieden = Disposition mit Wirkung pflicht/optional/ausgeschlossen (Profil-Modus). */
  istEntschieden(path: string): boolean {
    const w = this.state.wirkungOf(path);
    return w === 'pflicht' || w === 'optional' || w === 'ausgeschlossen';
  }

  /** Punkt-Entscheidung je Modus (Instanz: Werte/Zweige statt Dispositionen). */
  private istEntschiedenPunkt(p: DecisionPoint): boolean {
    if (!this.instanzModus()) return this.istEntschieden(p.path);
    const w = this.state.wirkungOf(p.path);
    // Weggelassen/abgewaehlt ist immer eine getroffene Entscheidung — auch fuer
    // Wert-Punkte (abgewaehlter Auswahl-Zweig mit frueher erfassten Werten).
    if (w === 'ausgeschlossen') return true;
    switch (p.art) {
      case 'wert':
        return this.wertOk(p.path);
      case 'auswahl': {
        const kinder = p.kinder ?? [];
        const offen = kinder.filter((k) => this.state.wirkungOf(k) !== 'ausgeschlossen');
        return offen.length === 1 && this.state.wirkungOf(offen[0]!) === 'pflicht';
      }
      case 'element':
        if (w !== 'pflicht') return false; // weder aufgenommen noch weggelassen
        return p.leaf ? this.wertOk(p.path) : true;
      case 'auspraegung':
        // Das Vorkommen existiert (Entscheidung getroffen); Blaetter brauchen den Wert.
        return p.leaf ? this.wertOk(p.path) : true;
    }
  }

  /** Verletzt dieser offene Punkt die Schema-Vollstaendigkeit? */
  private istKritisch(p: DecisionPoint): boolean {
    switch (p.art) {
      case 'wert':
        return true;
      case 'auswahl':
        return !!p.pflicht || this.state.wirkungOf(p.path) === 'pflicht';
      case 'element':
        return !!p.leaf && this.state.wirkungOf(p.path) === 'pflicht';
      case 'auspraegung':
        return !!p.leaf;
    }
  }

  /** Blatt hat einen nicht-leeren, typkonformen Wert. */
  wertOk(path: string): boolean {
    const wert = this.state.elemente()[path]?.beispiel?.trim();
    if (!wert) return false;
    const n = this.walk().wertNodes.get(path);
    if (!n) return true; // kein bekanntes Blatt — nicht strenger sein als noetig
    return this.values.wertProblem(n, wert) === null;
  }

  // ── Kardinalitaet im Durchlauf (Issue #27) ──────────────────────────

  /**
   * **Zaehlkonvention der Vorkommen** — die Grundlage aller Kardinalitaets-
   * Sperren, bewusst festgeschrieben statt implizit (Issue #50):
   *
   * - Fuehrt das Element benannte Auspraegungen, ist ihre Zahl massgeblich.
   * - Sonst steht der generische Unterbaum fuer **ein** Vorkommen …
   * - … es sei denn, der Durchlauf hat das Element weggelassen oder die
   *   gebundene Fassung schliesst es aus — dann traegt es **keines**.
   *
   * Daraus folgt, was materialisiert wird: als Auspraegung erst eine
   * Mindestanzahl >= 2 (`TestmessageCreateService.legeMindestVorkommenAn`) —
   * eine Mindestanzahl 1 erfuellt das Element selbst, sobald es in der
   * Nachricht ist. Damit sie mehr ist als eine Zaehlregel, wird sie nicht ueber
   * ein zusaetzliches Vorkommen, sondern ueber `kardSperreWeglassen`
   * durchgesetzt.
   */
  private vorkommenAnzahl(path: string): number {
    const benannt = this.state.auspsOf(path)?.length ?? 0;
    if (benannt) return benannt;
    const ohneVorkommen =
      this.state.wirkungOf(path) === 'ausgeschlossen' || this.state.vorgabeGesperrt(path);
    return ohneVorkommen ? 0 : 1;
  }

  /**
   * Effektive Kardinalitaet und die Zahl der Vorkommen eines wiederholbaren
   * Elements — Grundlage der Sperren. Nur im Instanz-Modus: beim Profilieren
   * sind Auspraegungen ein Entwurfsmittel und bleiben frei. Gezaehlt wird nach
   * der Konvention in `vorkommenAnzahl`.
   */
  private kardLage(
    path: string,
  ): { min: number; max: number; minProfil: boolean; maxProfil: boolean; n: number } | null {
    if (!this.instanzModus()) return null;
    const it = this.nav.findItemByPath(path);
    if (!it || it.kind !== 'el') return null;
    const k = this.state.effKard(it.node);
    return {
      min: parseInt(k.min, 10) || 0,
      max: k.max === 'unbounded' ? Infinity : parseInt(k.max, 10) || 0,
      minProfil: k.minProfil,
      maxProfil: k.maxProfil,
      n: this.vorkommenAnzahl(path),
    };
  }

  private quelle(ausProfil: boolean): string {
    return ausProfil ? 'Die Profilierung' : 'Das Schema';
  }

  /**
   * Grund, warum an diesem Element **kein weiteres Vorkommen** angelegt werden
   * darf — null, solange die Hoechstanzahl nicht erreicht ist. Die im Profil
   * eingegrenzte Kardinalitaet wird hart durchgesetzt; ohne Eingrenzung gilt
   * unveraendert die des Schemas (Spec "Testnachricht aus einer Profilierung").
   */
  kardSperreHinzu(path: string): string | null {
    const k = this.kardLage(path);
    if (!k || k.n < k.max) return null;
    return `${this.quelle(k.maxProfil)} lässt höchstens ${k.max} Vorkommen zu.`;
  }

  /**
   * Grund, warum ein Vorkommen dieses Elements **nicht entfernt** werden darf —
   * null, solange die Mindestanzahl auch danach eingehalten ist. Damit sind die
   * beim Start materialisierten Mindest-Vorkommen nicht entfernbar.
   */
  kardSperreEntfernen(path: string): string | null {
    const k = this.kardLage(path);
    // Nach dem Entfernen bleibt mindestens der generische Unterbaum stehen.
    if (!k || (k.n - 1 || 1) >= k.min) return null;
    return `${this.quelle(k.minProfil)} verlangt mindestens ${k.min} Vorkommen.`;
  }

  /**
   * Grund, warum dieses Element **nicht weggelassen** werden darf — null,
   * solange die Untergrenze das Weglassen zulaesst. Ohne diese Sperre bliebe
   * eine Mindestanzahl 1 der Profilierung folgenlos: nach der Zaehlkonvention
   * (`vorkommenAnzahl`) erfuellt sie das Element selbst, es waere aber schlicht
   * abwaehlbar — die Untergrenze waere gezaehlt, nicht durchgesetzt.
   *
   * Massgeblich ist allein die Eingrenzung der **Profilierung**: die
   * Mindestanzahl des Schemas macht ein Element ohnehin zum Pflicht-Rueckgrat
   * ohne Aufnahme-Frage, und ein Auswahl-Zweig traegt sein `min=1` aus dem
   * Schema — ihn zu sperren machte den Zweigwechsel unmoeglich.
   */
  kardSperreWeglassen(path: string): string | null {
    const k = this.kardLage(path);
    if (!k || !k.minProfil || k.min < 1) return null;
    return `${this.quelle(k.minProfil)} verlangt mindestens ${k.min} Vorkommen.`;
  }

  /**
   * Grund, warum auf diesen Zweig **nicht umgeschaltet** werden darf — null,
   * wenn die Wahl frei ist. Die Zweigwahl schliesst die Geschwister aus; traegt
   * einer davon eine Mindestanzahl der **Profilierung**, ist das derselbe
   * Vorgang, den `kardSperreWeglassen` am einzelnen Element verhindert, nur
   * ueber den Radio-Knopf. Ohne die Pruefung waere das ✕ am Zweig gesperrt,
   * der Klick auf den Nachbarzweig schloesse ihn aber still aus.
   *
   * Dass ein choice-Zweig zugleich verlangt und durch die Wahl eines anderen
   * ausgeschlossen wuerde, ist ein Widerspruch **in der Profilierung** — der
   * Durchlauf loest ihn nicht auf, er verweigert die Umschaltung und nennt den
   * Grund. Der schema-eigene `min=1` eines Zweigs zaehlt nicht mit
   * (`kardSperreWeglassen` prueft `minProfil`), sonst waere jede Auswahl
   * unveraenderlich.
   */
  kardSperreZweigwechsel(auswahlPath: string, zweigPath: string): string | null {
    const p = this.punktAt(auswahlPath);
    if (!p || p.art !== 'auswahl') return null;
    for (const k of p.kinder ?? []) {
      if (k === zweigPath) continue;
      const grund = this.kardSperreWeglassen(k);
      if (grund) return grund;
    }
    return null;
  }

  // ── Spur-Navigation ─────────────────────────────────────────────────

  /**
   * Naechster offener Punkt in Dokumentreihenfolge nach `fromPath` (exklusiv),
   * mit einmaligem Wrap-around an den Anfang; null wenn alles entschieden.
   */
  nextOpen(fromPath?: string | null): string | null {
    const { punkte, seqOf } = this.walk();
    const offen = punkte.filter((p) => !this.istEntschiedenPunkt(p));
    if (!offen.length) return null;
    const fromSeq = fromPath != null ? (seqOf.get(fromPath) ?? -1) : -1;
    return (offen.find((p) => p.seq > fromSeq) ?? offen[0]!).path;
  }

  /** Zum naechsten offenen Punkt springen (ab aktueller Auswahl). */
  gotoNextOpen(): void {
    const p = this.nextOpen(this.selPath());
    if (p) this.nav.jumpTo(p);
  }

  /** Naechster Punkt (auch entschiedene — zum Durchblaettern/Korrigieren). */
  gotoNext(): void {
    const { punkte, seqOf } = this.walk();
    const fromSeq = this.selSeq(seqOf);
    const p = punkte.find((x) => x.seq > fromSeq);
    if (p) this.nav.jumpTo(p.path);
  }

  /** Vorheriger Punkt. */
  gotoPrev(): void {
    const { punkte, seqOf } = this.walk();
    const fromSeq = this.selSeq(seqOf);
    for (let i = punkte.length - 1; i >= 0; i--) {
      if (punkte[i]!.seq < fromSeq) {
        this.nav.jumpTo(punkte[i]!.path);
        return;
      }
    }
  }

  /**
   * Disposition des aktuellen Punkts per Wirkung setzen (Tastatur z/o/n) und
   * automatisch zum naechsten offenen Punkt springen. Aufloesung ueber die
   * Wirkung statt Status-IDs, damit umbenannte/eigene Stufen greifen (wie die
   * Dispositions-Buttons im Detail-Panel). false, wenn nichts selektiert ist
   * oder die Profilierung keine Stufe mit passender Wirkung konfiguriert hat.
   */
  setzeDisposition(wirkung: 'pflicht' | 'optional' | 'ausgeschlossen'): boolean {
    const path = this.selPath();
    if (path == null) return false;
    const st =
      wirkung === 'pflicht'
        ? this.state.pflichtStatus()
        : wirkung === 'optional'
          ? this.state.optionalStatus()
          : this.state.exclStatus();
    if (!st) return false;
    this.disposition.setzeStatus(path, st.id);
    this.gotoNextOpen();
    return true;
  }

  private selPath(): string | null {
    const it = this.state.selItem();
    return it ? itemPath(it) : null;
  }

  private selSeq(seqOf: Map<string, number>): number {
    const p = this.selPath();
    return p != null ? (seqOf.get(p) ?? -1) : -1;
  }

  // ── Auswahl-Schritt (choice), Profil-Modus ──────────────────────────

  /**
   * Zulaessigkeit eines choice-Zweigs setzen: nicht zulaessig = Wirkung
   * "ausgeschlossen" auf dem Kind-Pfad (kaskadiert/schneidet ab); wieder
   * zulaessig = Status entfernen (der Zweig ist danach erneut zu entscheiden).
   * Die erste explizite Aussage markiert zugleich den Auswahl-Schritt als
   * entschieden (Pflicht-Marker auf dem Gruppen-Pfad bei min>=1-choice).
   */
  setzeZweig(groupPath: string, childPath: string, zulaessig: boolean): void {
    const excl = this.state.exclStatus();
    if (!excl) return;
    this.state.setElementProfile(childPath, { status: zulaessig ? undefined : excl.id });
    this.markiereAuswahl(groupPath);
  }

  /**
   * "Alle (verbleibenden) Alternativen sind zulaessig" bestaetigen — noetig, um
   * eine bewusst uneingeschraenkte Auswahl von "noch nicht angesehen" zu
   * unterscheiden. Marker = Pflicht-Status auf dem synthetischen Gruppen-Pfad
   * (Schematron ignoriert synthetische Knoten; kein neues Datenfeld).
   */
  bestaetigeAuswahl(groupPath: string): void {
    this.markiereAuswahl(groupPath, true);
  }

  /**
   * Pflicht-Marker auf der Gruppe setzen (nie ueberschreiben). Nur fuer
   * synthetische choice-Gruppen: bei benannten auswahl_*-Elementen traegt das
   * Element seine Disposition selbst (Vorbelegung bzw. Dispositions-Buttons) —
   * ein automatischer Pflicht-Status wuerde dort eine echte Schematron-Regel
   * erzeugen. Implizit (via setzeZweig) zudem nur bei Pflicht-Auswahlen: bei
   * einer optionalen choice (min=0) ist die Gruppen-Disposition selbst die
   * Entscheidung und bleibt dem Anwender ueberlassen.
   */
  private markiereAuswahl(groupPath: string, explizit = false): void {
    if (this.istEntschieden(groupPath)) return;
    const it = this.nav.findItemByPath(groupPath);
    if (!it || it.kind !== 'el' || !it.node.synthetic) return;
    if (!explizit && it.node.min === '0') return;
    const pflicht = this.state.pflichtStatus();
    if (pflicht) this.state.setElementProfile(groupPath, { status: pflicht.id });
  }

  // ── Instanz-Modus: Aufnahme, Zweigwahl, Dummy-Befuellung ────────────

  /**
   * Optionales Element aufnehmen (`pflicht`), weglassen (`ausgeschlossen`)
   * oder die Entscheidung zuruecknehmen (null). Nicht-destruktiv: darunter
   * erfasste Werte bleiben erhalten und wirken erst wieder mit der Aufnahme.
   * Was die gebundene Fassung zwingend setzt oder mit einer Mindestanzahl
   * verlangt, ist nicht abwaehlbar — der Durchlauf kann das Szenario nicht
   * unterlaufen.
   */
  setzeAufnahme(path: string, aufnehmen: boolean | null): void {
    if (!aufnehmen && this.state.profilWirkungGeerbt(path) === 'pflicht') return;
    if (!aufnehmen && this.kardSperreWeglassen(path)) return;
    if (aufnehmen === null) {
      this.state.setElementProfile(path, { status: undefined });
      return;
    }
    const st = aufnehmen ? this.state.pflichtStatus() : this.state.exclStatus();
    if (st) this.state.setElementProfile(path, { status: st.id });
  }

  /**
   * Instanz-Auswahl: genau EIN Zweig je Vorkommen. Der gewaehlte Zweig wird
   * aufgenommen (`pflicht`), alle Geschwister ausgeschlossen; ein optionales
   * benanntes Auswahl-Element gilt mit der Zweigwahl zugleich als aufgenommen.
   * Nicht-destruktiv: Werte in abgewaehlten Zweigen bleiben erhalten.
   */
  waehleZweig(auswahlPath: string, zweigPath: string): void {
    const p = this.punktAt(auswahlPath);
    const pflicht = this.state.pflichtStatus();
    const excl = this.state.exclStatus();
    if (!p || p.art !== 'auswahl' || !pflicht || !excl) return;
    // Die Zweigwahl schliesst die Geschwister aus — und ist damit derselbe
    // Vorgang, den `kardSperreWeglassen` an einem einzelnen Element verhindert.
    // Ohne diese Pruefung umgaeht der Radio-Klick die Sperre: das ✕ am Zweig
    // waere gesperrt, der Klick auf den Nachbarn schloesse ihn still aus.
    if (this.kardSperreZweigwechsel(auswahlPath, zweigPath)) return;
    for (const k of p.kinder ?? []) {
      this.state.setElementProfile(k, { status: k === zweigPath ? pflicht.id : excl.id });
    }
    // Benanntes (nicht-synthetisches) Auswahl-Element: Aufnahme mit der Wahl.
    const it = this.nav.findItemByPath(auswahlPath);
    if (
      it &&
      it.kind === 'el' &&
      !it.node.synthetic &&
      this.state.wirkungOf(auswahlPath) !== 'pflicht'
    ) {
      this.state.setElementProfile(auswahlPath, { status: pflicht.id });
    }
  }

  /**
   * Fuellt alle offenen Pflichtwerte (Wert-Punkte, aufgenommene Blaetter,
   * Vorkommen-Blaetter) typkonform mit Dummy-Werten. Gibt die Anzahl gesetzter
   * Felder zurueck.
   */
  fuellePflichtfelder(): number {
    const { punkte, wertNodes } = this.walk();
    let n = 0;
    for (const p of punkte) {
      if (!p.leaf && p.art !== 'wert') continue;
      if (this.istEntschiedenPunkt(p)) continue;
      if (!this.istKritisch(p)) continue;
      const node = wertNodes.get(p.path);
      if (!node) continue;
      this.state.setElementProfile(p.path, { beispiel: this.values.dummyFor(node) });
      n++;
    }
    return n;
  }
}
