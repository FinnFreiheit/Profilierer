import { Injectable, Signal, computed, inject } from '@angular/core';
import { Auspraegung } from '../../models/profile.model';
import { TreeNode, itemPath } from '../../models/node.model';
import { refKindEff, refTraeger } from '../refs';
import { segmentKette, unterPfad, vorfahren } from '../util/pfad.util';
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
 *
 * Im Instanz-Modus (Testnachricht gefuehrt erstellen) sind es **Stationen**, und
 * nur ein Teil davon schuldet eine Antwort: `wert` mit `pflicht: true` braucht
 * einen typkonformen Wert, `wert` mit `pflicht: false` ist ein freies Feld (der
 * Wert allein sagt, ob das Element vorkommt), `element` ist ein optionaler
 * Container, den man angibt oder uebergeht.
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
 * mit Instanz-Semantik — **der Wert entscheidet** (ADR 0016):
 * - Pflicht-Blaetter sind `wert`-Punkte (offen, bis ein typkonformer Wert da ist),
 * - optionale Blaetter sind freie `wert`-Punkte: ein eingetragener Wert bringt
 *   das Element in die Nachricht, kein Wert laesst es weg — es gibt dort keine
 *   Ja/Nein-Frage und nichts Offenes (nur ein typwidriger Wert zaehlt als offen),
 * - optionale **Container** tragen keinen Wert; sie werden angegeben (Wirkung
 *   `pflicht`) oder uebergangen. Abgestiegen wird nur in Angegebenes (bzw. in
 *   Aeste, die bereits Inhalt tragen — Nachrichten-Bearbeitung),
 * - eine Auswahl (`choice`) verlangt **genau einen** Zweig je Vorkommen; ist
 *   keiner ausdruecklich gewaehlt, gilt ein einzig befuellter Zweig als gewaehlt,
 * - Auspraegungen sind die Vorkommen wiederholbarer Elemente.
 *
 * Reaktivitaet: Der teure Struktur-Walk haengt an root/auspraegungen, einem
 * Ausschluss-Fingerprint und — seit #59 auch im Profil-Modus, weil
 * `vorgabeWirkung` die eigene Entscheidung prueft — an `elemente`; im
 * Instanz-Modus steuern Aufnahme/Inhalt zusaetzlich den Abstieg.
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

  /**
   * Pfade, unter denen die Nachricht **Inhalt** traegt (erfasster Wert oder
   * angelegtes Vorkommen) — jeweils samt aller Vorfahren, damit `has(pfad)`
   * fragt: liegt unter diesem Ast irgendetwas? Grundlage des wertgetriebenen
   * Durchlaufs: der Walk steigt in befuellte Aeste auch ohne Angabe ab, ein
   * einzig befuellter Auswahl-Zweig gilt als gewaehlt, und eine Angabe laesst
   * sich nicht zuruecknehmen, solange darunter Werte stehen. Bewusst **ohne**
   * Modus-Bedingung: die Serialisierung fragt dieselbe Karte, und sie laeuft
   * auch ohne laufende Sitzung (Erzeugen aus dem Speicher heraus). Gelesen wird
   * sie ohnehin nur auf Instanz-Wegen.
   */
  private readonly inhaltPfade = computed<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    const merke = (path: string): void => {
      for (const p of segmentKette(path)) set.add(p);
    };
    for (const [path, p] of Object.entries(this.state.elemente())) {
      if (p.beispiel) merke(path);
    }
    for (const path of Object.keys(this.state.auspraegungen())) merke(path);
    return set;
  });

  /** Traegt dieser Ast (Element selbst oder etwas darunter) eine Angabe? */
  hatInhalt(path: string): boolean {
    return this.inhaltPfade().has(path);
  }

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
    // Schema es freistellt. Es ist damit keine freie Station mehr, sondern
    // Pflicht-Rueckgrat — Blaetter brauchen einen typkonformen Wert, Container
    // werden ohne Rueckfrage betreten. Wie der Marker ueber
    // profilWirkungGeerbt, damit die Festlegung auch innerhalb eines Vorkommens
    // greift — sonst verlangte der Durchlauf am Traegerelement, was er in der
    // Auspraegung wieder freigibt.
    //
    // Die **Mindestanzahl der Profilierung** zaehlt genauso: seit der Durchlauf
    // kein "weglassen" mehr kennt, gibt es keine Abwahl, an der eine Sperre
    // greifen koennte (frueher `kardSperreWeglassen`) — eine Untergrenze >= 1
    // macht das Element deshalb zum Pflicht-Rueckgrat. Nur die Eingrenzung der
    // Profilierung: die Schema-Untergrenze fuehrt ohnehin ueber `n.min`, und ein
    // Auswahl-Zweig traegt sein `min=1` aus dem Schema.
    const zwingend = (n: TreeNode): boolean => {
      if (!instanz) return false;
      if (this.state.profilWirkungGeerbt(n.path) === 'pflicht') return true;
      const k = this.state.effKard(n);
      return k.minProfil && (parseInt(k.min, 10) || 0) >= 1;
    };
    const punkte: DecisionPoint[] = [];
    const seqOf = new Map<string, number>();
    const wertNodes = new Map<string, PlaceholderNode>();
    if (!root) return { punkte, seqOf, wertNodes };
    let seq = 0;

    // Pfade, unter denen bereits Inhalt liegt (Werte/Auspraegungen) — im
    // Instanz-Modus wird in solche Aeste auch ohne Angabe abgestiegen
    // (Nachrichten-Bearbeitung: vorhandener Inhalt hat keine Wirkungen).
    const inhalt = this.inhaltPfade();

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
        } else if (n.min === '0' && !zwingend(n)) {
          // Optionale Gruppe: eigene Station (Container), sonst blieben ihre
          // Pflicht-Kinder unerreichbar bzw. beim Profilieren unentschieden.
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
      const optional = (n.min === '0' && !zwingend(n)) || n.inChoice;
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
          // Der Wert entscheidet (ADR 0016): am optionalen **Blatt** gibt es
          // keine Ja/Nein-Frage, nur ein freies Feld. Ein optionaler
          // **Container** traegt keinen Wert — dort bleibt die Station
          // "angeben / uebergehen".
          if (leaf) {
            punkte.push({
              path: n.path,
              art: 'wert',
              seq: seqOf.get(n.path)!,
              leaf: true,
              pflicht: false,
            });
            merkeWertNode(n, n.path);
          } else {
            punkte.push({ path: n.path, art: 'element', seq: seqOf.get(n.path)! });
          }
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
      // Instanz: in uebergangene optionale Teilbaeume nicht absteigen — ihre
      // Stationen entstehen erst mit der Angabe (oder mit Inhalt darunter).
      // Damit haengt auch jede **Pflicht** unterhalb an der Elternkette: was der
      // Durchlauf nicht betritt, verlangt er nicht.
      if (instanz && optional && !istChoiceEl && !steigAb(n.path)) return;

      const vorkommen = this.tree.vorkommenKinder(n);
      if (vorkommen) {
        // Auspraegungen ersetzen den generischen Unterbaum — die Regel liegt
        // im TreeService (vorkommenKinder), der Walk behaelt seine Punktlogik.
        for (const { node: cn, ausp: a } of vorkommen) {
          if (gesperrt(cn.path)) continue; // ausgeschlossenes Vorkommen der Vorgabe
          // Optionale Auspraegung der gebundenen Fassung: eine Station statt
          // eines Vorkommens, das mit seinem Dasein bereits entschieden waere
          // (Spec #28) — ein Blatt-Vorkommen als freies Feld, ein Container als
          // "angeben / uebergehen". Nur fuer **profilierte** Auspraegungen —
          // eine selbst angelegte Kopie (`vonId`) hat der Anwender bewusst
          // erzeugt, sie ist damit angegeben.
          const auspOptional =
            instanz && !a.vonId && this.state.profilWirkung(cn.path) === 'optional';
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
          } else if (auspOptional && cnLeaf) {
            // Optionales Blatt-Vorkommen: freies Feld, der Wert entscheidet.
            punkte.push({
              path: cn.path,
              art: 'wert',
              seq: seqOf.get(cn.path)!,
              leaf: true,
              pflicht: false,
            });
            merkeWertNode(cn, cn.path);
          } else {
            punkte.push({
              path: cn.path,
              art: auspOptional ? 'element' : 'auspraegung',
              seq: seqOf.get(cn.path)!,
              leaf: cnLeaf, // bei auspOptional hier stets false (Blatt oben behandelt)
            });
            if (instanz && cnLeaf) merkeWertNode(cn, cn.path);
          }
          if (excl.has(cn.path)) continue;
          // Wie bei jedem optionalen Element: die Stationen darunter entstehen
          // erst mit der Angabe.
          if (auspOptional && !steigAb(cn.path)) continue;
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

  /**
   * **Geparkte** Punkte (Issue #41): das Element traegt eine Statusstufe mit
   * Wirkung `markierung` ("zu klaeren"). Sie sind bewusst weder entschieden noch
   * offen — die fachliche Frage steht noch aus, der Durchlauf soll aber
   * weiterlaufen koennen. Nur im **Profil**-Modus: in einer konkreten Nachricht
   * gibt es keine offene Festlegung (die vierte Entscheidung existiert dort
   * nicht), und `markierung` bedeutete dort weder Aufnahme noch Ausschluss.
   */
  readonly geparkteSet: Signal<ReadonlySet<string>> = computed(() => {
    const set = new Set<string>();
    if (this.instanzModus()) return set;
    for (const p of this.walk().punkte) {
      if (this.state.wirkungOf(p.path) === 'markierung') set.add(p.path);
    }
    return set;
  });

  /** Offene (unentschiedene, nicht geparkte) Punkt-Pfade — O(1)-Lookup fuer den Baum. */
  readonly offeneSet: Signal<ReadonlySet<string>> = computed(() => {
    const geparkt = this.geparkteSet();
    const set = new Set<string>();
    for (const p of this.walk().punkte) {
      if (geparkt.has(p.path)) continue; // geparkt: sichtbar erledigt-vertagt
      if (!this.istEntschiedenPunkt(p)) set.add(p.path);
    }
    return set;
  });

  /**
   * Fortschritt: X entschiedene von Y echten Nutzer-Entscheidungen, dazu die
   * geparkten (Issue #41). Restarbeit und Klaerungsbedarf sind zwei Dinge und
   * werden getrennt ausgewiesen: `x + offen + zuKlaeren === y`.
   *
   * Im **Instanz-Modus** zaehlt Y nur die geschuldeten Stationen
   * (`zaehltZurPflicht`) — Optionales, das man einfach uebergeht, ist keine
   * Restarbeit und darf den Zaehler nicht aufblaehen (ADR 0016). Die Invariante
   * `x + offen === y` bleibt: jede offene Station ist eine geschuldete.
   */
  readonly fortschritt: Signal<{ x: number; y: number; zuKlaeren: number }> = computed(() => {
    const punkte = this.walk().punkte;
    if (this.instanzModus()) {
      let x = 0;
      let y = 0;
      for (const p of punkte) {
        if (!this.zaehltZurPflicht(p)) continue;
        y++;
        if (this.istEntschiedenPunkt(p)) x++;
      }
      return { x, y, zuKlaeren: 0 };
    }
    const y = punkte.length;
    const zuKlaeren = this.geparkteSet().size;
    return { x: y - this.offeneSet().size - zuKlaeren, y, zuKlaeren };
  });

  /**
   * Instanz-Modus: schuldet diese Station eine Antwort, gehoert sie also in den
   * Nenner von "X von Y Pflichtangaben"? Ein freies Feld zaehlt erst mit, sobald
   * ein Wert darin steht — was angegeben ist, muss auch stimmen; ein leeres
   * bleibt aussen vor. Eine optionale Auswahl zaehlt erst, wenn sie betreten
   * wurde, ein Container nie (er ist Weg, nicht Angabe).
   */
  private zaehltZurPflicht(p: DecisionPoint): boolean {
    switch (p.art) {
      case 'wert':
        return p.pflicht !== false || !!this.state.elemente()[p.path]?.beispiel?.trim();
      case 'auswahl':
        return this.auswahlGefordert(p);
      case 'auspraegung':
        return !!p.leaf;
      case 'element':
        return false;
    }
  }

  /** Muss diese Auswahl belegt werden (Schema-Pflicht oder betretener Container)? */
  private auswahlGefordert(p: DecisionPoint): boolean {
    return !!p.pflicht || this.state.wirkungOf(p.path) === 'pflicht';
  }

  /**
   * Einordnung einer Station fuer die Darstellung: verlangt die Nachricht sie
   * (`pflicht`, grün) oder steht sie frei (`frei`, orange)? Anders als
   * `zaehltZurPflicht` ist das eine **strukturelle** Aussage — ein befülltes
   * freies Feld bleibt frei, es ist ja weiterhin löschbar. `null` ausserhalb des
   * Instanz-Modus und an Pfaden ohne Station.
   */
  stationArt(path: string): 'pflicht' | 'frei' | null {
    if (!this.instanzModus()) return null;
    const p = this.punktAt(path);
    if (!p) return null;
    switch (p.art) {
      case 'wert':
        return p.pflicht === false ? 'frei' : 'pflicht';
      case 'auswahl':
        return this.auswahlGefordert(p) ? 'pflicht' : 'frei';
      case 'element':
        return 'frei';
      case 'auspraegung':
        return 'pflicht'; // das Vorkommen existiert und gehoert zur Nachricht
    }
  }

  /**
   * Grund, warum die ausgewaehlte Station **nicht uebersprungen** werden darf —
   * null, wenn der Durchlauf weiterblaettern darf. Pflichtangaben sind nicht
   * uebergehbar: eine leere oder typwidrige Pflichtangabe und eine unbelegte
   * Pflicht-Auswahl halten die Spur fest, statt still eine unvollstaendige
   * Nachricht entstehen zu lassen.
   *
   * Festgehalten wird nur die **Weiter**-Bewegung. Zurueck (↑), das Verlassen
   * eines Containers (→), der Sprung „Nächster offener" und jeder Klick im Baum
   * bleiben frei — sonst waere der Durchlauf an einer Stelle gefangen, die sich
   * vielleicht erst spaeter beantworten laesst.
   */
  ueberspringSperre(): string | null {
    if (!this.instanzModus()) return null;
    const path = this.selPath();
    if (path == null) return null;
    const p = this.punktAt(path);
    if (!p || this.istEntschiedenPunkt(p) || !this.istKritisch(p)) return null;
    return p.art === 'auswahl'
      ? 'Pflicht-Auswahl — erst einen Zweig wählen, dann weiter.'
      : 'Pflichtangabe — erst einen typkonformen Wert eintragen, dann weiter.';
  }

  /**
   * Eine Station uebergehen (Taste ↓, „Weiter ›"): zur naechsten blaettern,
   * sofern die aktuelle das zulaesst. `false` mit Grund in `ueberspringSperre`,
   * wenn eine Pflichtangabe festhaelt.
   */
  ueberspringen(): boolean {
    if (this.ueberspringSperre()) return false;
    this.gotoNext();
    return true;
  }

  /**
   * Instanz-Modus: Anzahl offener Punkte, die die Schema-Vollstaendigkeit
   * verletzen (leere/typwidrige Pflichtwerte, ungeloeste Pflicht-Auswahlen,
   * typwidrige freie Werte) — das "valide"-Kriterium der Story.
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
   * einer Profilierung"). Beruehrt heisst: das Element landet in der Nachricht —
   * ein freies Feld also erst mit einem Wert, ein optionaler Container erst mit
   * der Angabe (oder Inhalt darunter), Uebergangenes nie. Synthetische Gruppen
   * (choice/sequence) bleiben aussen vor — sie sind keine Elemente der
   * Nachricht, sondern Schema-Partikel.
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
    switch (p.art) {
      // Freies Feld: der Wert entscheidet. Pflichtwerte liegen ohnehin auf dem
      // erzwungenen Weg und zaehlen auch leer als beruehrt.
      case 'wert':
        return p.pflicht !== false || !!this.state.elemente()[p.path]?.beispiel?.trim();
      // Optionaler Container: angegeben oder mit Inhalt darunter.
      case 'element':
        return w === 'pflicht' || this.hatInhalt(p.path);
      // Alles Weitere hat der Walk nur besucht, weil es auf dem
      // Pflicht-/gewaehlten Weg liegt.
      default:
        return true;
    }
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
        // Freies Feld: leer ist eine gueltige Antwort ("kein Vorkommen"), ein
        // eingetragener Wert muss dagegen typkonform sein — sonst entstuende
        // stillschweigend eine schemawidrige Nachricht.
        if (p.pflicht === false && !this.state.elemente()[p.path]?.beispiel?.trim()) return true;
        return this.wertOk(p.path);
      case 'auswahl':
        if (this.gewaehlterZweig(p.path, p.kinder)) return true;
        // Ohne Zweig ist nur eine geforderte Auswahl offen; eine optionale
        // wartet nicht auf eine Antwort, sie wird schlicht uebergangen.
        return !this.auswahlGefordert(p);
      case 'element':
        // Optionaler Container: eine Station, keine Frage — der Durchlauf darf
        // sie jederzeit uebergehen (ADR 0016).
        return true;
      case 'auspraegung':
        // Das Vorkommen existiert (Entscheidung getroffen); Blaetter brauchen den Wert.
        return p.leaf ? this.wertOk(p.path) : true;
    }
  }

  /** Verletzt dieser offene Punkt die Schema-Vollstaendigkeit? */
  private istKritisch(p: DecisionPoint): boolean {
    switch (p.art) {
      case 'wert':
        // Offen heisst hier: Pflichtwert fehlt/ist typwidrig, oder ein freier
        // Wert wurde typwidrig eingetragen — beides verletzt das Schema.
        return true;
      case 'auswahl':
        return this.auswahlGefordert(p);
      case 'element':
        return false; // Container-Station ist nie offen
      case 'auspraegung':
        return !!p.leaf;
    }
  }

  /**
   * Der gewaehlte Zweig einer Auswahl — `null`, solange die Wahl offen oder
   * mehrdeutig ist. Zwei Lesarten, in dieser Reihenfolge:
   *
   * 1. **ausdruecklich gewaehlt** (`waehleZweig`: der Zweig traegt `pflicht`),
   * 2. **einzig befuellt** — steht in genau einem Zweig ein Wert und ist keiner
   *    ausdruecklich gewaehlt, ist die Wahl damit getroffen (ADR 0016: es reicht,
   *    einen Wert anzugeben). Bei mehreren befuellten Zweigen bleibt die Auswahl
   *    offen, statt einen zu erfinden.
   *
   * Gemeinsame Leseregel von Fuehrung und Serialisierung (`ExportService`),
   * damit im XML genau der Zweig steht, den der Durchlauf als gewaehlt anzeigt.
   */
  gewaehlterZweig(auswahlPath: string, kinderPfade?: string[]): string | null {
    const kinder = kinderPfade ?? this.punktAt(auswahlPath)?.kinder ?? [];
    const offen = kinder.filter((k) => this.state.wirkungOf(k) !== 'ausgeschlossen');
    const gewaehlt = offen.filter((k) => this.state.wirkungOf(k) === 'pflicht');
    if (gewaehlt.length) return gewaehlt.length === 1 ? gewaehlt[0]! : null;
    const befuellt = offen.filter((k) => this.hatInhalt(k));
    return befuellt.length === 1 ? befuellt[0]! : null;
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
    // Kein Item im Baum: **keine** Sperre (Nachlese zu #27, Issue #49 —
    // bewusst so entschieden). Was der Baum nicht kennt, rendert er auch nicht;
    // es gibt dort weder einen Knopf zu sperren noch ein Vorkommen zu schuetzen.
    // Der Fall entsteht durch veraltete Auswahl oder einen Pfad aus einer alten
    // Fassung — eine Sperre begruendete dort etwas, das gar nicht sichtbar ist.
    // Die Grenzen selbst bleiben durchgesetzt: `KonformitaetService` prueft die
    // gespeicherte Nachricht unabhaengig vom Baum (#31).
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
   * Grund, warum dieses **Vorkommen** nicht entfernt werden darf — null, wenn es
   * entfernbar ist. Massgeblich ist die Aussage der gebundenen Fassung **zum
   * Vorkommen selbst**: setzt sie es zwingend, beschreibt es das Szenario und
   * bleibt (Spec "zwingende Auspraegungen sind von Anfang an vorhanden und nicht
   * entfernbar"). Eine Auspraegung **ohne** eigene Festlegung bleibt entfernbar —
   * sie ist der Normalfall bestehender Profilierungen und dort als Beschreibung
   * gemeint, nicht als Leitplanke.
   *
   * Getrennt von `kardSperreEntfernen`, das die Anzahl huetet: hier geht es um
   * die Identitaet eines benannten Vorkommens. Beide koennen zutreffen, der
   * Aufrufer nimmt den ersten Grund.
   */
  auspSperreEntfernen(listPath: string, auspId: string): string | null {
    if (!this.instanzModus()) return null; // beim Profilieren sind sie Entwurfsmittel
    // **Pfadgenau**, nicht geerbt: dass das Traegerelement zwingend ist, sagt nur,
    // dass es vorkommen muss — nicht, dass jedes einzelne benannte Vorkommen
    // bleiben muss. Ueber `profilWirkungGeerbt` waere jedes Vorkommen eines
    // zwingenden Elements unentfernbar, auch ein selbst angelegtes.
    if (this.state.profilWirkung(`${listPath}@${auspId}`) !== 'pflicht') return null;
    const name = this.state.auspsOf(listPath)?.find((a) => a.id === auspId)?.name;
    return `Die Profilierung setzt das Vorkommen${name ? ` „${name}"` : ''} zwingend.`;
  }

  /**
   * Die profilierten Auspraegungen, aus denen ein **weiteres Vorkommen** dieses
   * Elements entstehen kann — null, wo die freie Anlage gilt (beim Profilieren
   * und ueberall, wo die gebundene Fassung keine Auspraegungen fuehrt).
   *
   * Spec #28: "Weitere Vorkommen entstehen ausschliesslich als Kopie einer
   * profilierten Auspraegung — der Anwender waehlt, welcher. Ein leeres,
   * unprofiliertes Vorkommen ist nicht moeglich, solange die Profilierung fuer
   * das Element Auspraegungen definiert." Gelesen wird die **eingefrorene
   * Fassung**, nicht die eigene Liste: waehlbar bleibt, was die Profilierung
   * beschreibt, auch nachdem der Durchlauf ein Vorkommen entfernt oder selbst
   * Kopien angelegt hat.
   */
  auspKopieKandidaten(listPath: string): Auspraegung[] | null {
    if (!this.instanzModus()) return null;
    const profiliert = this.state.vorgabeAusps(listPath);
    return profiliert?.length ? profiliert : null;
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
    // Geparkte Punkte werden uebersprungen (Issue #41) — sonst liefe die
    // Fuehrung immer wieder in den eigenen Merker, statt ihn zu vertagen.
    const geparkt = this.geparkteSet();
    const offen = punkte.filter((p) => !geparkt.has(p.path) && !this.istEntschiedenPunkt(p));
    if (!offen.length) return null;
    const fromSeq = fromPath != null ? (seqOf.get(fromPath) ?? -1) : -1;
    return (offen.find((p) => p.seq > fromSeq) ?? offen[0]!).path;
  }

  /** Zum naechsten offenen Punkt springen (ab aktueller Auswahl). */
  gotoNextOpen(): void {
    const p = this.nextOpen(this.selPath());
    if (p) this.nav.jumpTo(p);
  }

  /**
   * Naechste Station (auch entschiedene — zum Durchblaettern/Korrigieren). Im
   * Instanz-Durchlauf ist das der Normalweg: eine uebergangene Station bleibt
   * ohne Aussage zurueck, und der Teilbaum eines nicht angegebenen Containers
   * wird mit uebersprungen — seine Kinder sind gar keine Stationen.
   */
  gotoNext(): boolean {
    const { punkte, seqOf } = this.walk();
    const fromSeq = this.selSeq(seqOf);
    const p = punkte.find((x) => x.seq > fromSeq);
    if (!p) return false;
    this.nav.jumpTo(p.path);
    return true;
  }

  /** Vorherige Station. */
  gotoPrev(): boolean {
    const { punkte, seqOf } = this.walk();
    const fromSeq = this.selSeq(seqOf);
    for (let i = punkte.length - 1; i >= 0; i--) {
      if (punkte[i]!.seq < fromSeq) {
        this.nav.jumpTo(punkte[i]!.path);
        return true;
      }
    }
    return false;
  }

  /**
   * Instanz-Durchlauf, Taste ↓: den ausgewaehlten optionalen Container angeben
   * und in ihn hineinspringen (auf seine erste Station). false, wenn die
   * Auswahl kein Container ist — dann bleibt es bei der Baum-Navigation.
   */
  betreteStation(): boolean {
    const path = this.selPath();
    if (path == null || !this.instanzModus()) return false;
    const p = this.punktAt(path);
    if (!p || p.art !== 'element') return false;
    this.gibAn(path);
    // Nach der Angabe entstehen die Stationen darunter — der Walk ist ein
    // Computed, die naechste Lesung sieht sie bereits.
    const { punkte, seqOf } = this.walk();
    const fromSeq = seqOf.get(path) ?? -1;
    const erste = punkte.find((x) => x.seq > fromSeq && unterPfad(x.path, path));
    this.nav.jumpTo(erste?.path ?? path);
    return true;
  }

  /**
   * Instanz-Durchlauf, Taste ↑: zur naechsthoeheren Station (den Container
   * verlassen). false, wenn darueber keine liegt.
   */
  gotoUebergeordnet(): boolean {
    const path = this.selPath();
    if (path == null || !this.instanzModus()) return false;
    const punkte = this.walk().punkte;
    const anc = vorfahren(path)
      .reverse()
      .find((a) => punkte.some((p) => p.path === a));
    if (!anc) return false;
    this.nav.jumpTo(anc);
    return true;
  }

  /**
   * Disposition des aktuellen Punkts per Wirkung setzen (Tastatur z/o/n) und
   * automatisch zum naechsten offenen Punkt springen. Aufloesung ueber die
   * Wirkung statt Status-IDs, damit umbenannte/eigene Stufen greifen (wie die
   * Dispositions-Buttons im Detail-Panel). false, wenn nichts selektiert ist
   * oder die Profilierung keine Stufe mit passender Wirkung konfiguriert hat.
   */
  setzeDisposition(wirkung: 'pflicht' | 'optional' | 'ausgeschlossen' | 'markierung'): boolean {
    const path = this.selPath();
    if (path == null) return false;
    // „Zu klären" gibt es nur beim Profilieren: eine konkrete Nachricht kann
    // keine offene Festlegung tragen (#41).
    if (wirkung === 'markierung' && this.instanzModus()) return false;
    const st =
      wirkung === 'pflicht'
        ? this.state.pflichtStatus()
        : wirkung === 'optional'
          ? this.state.optionalStatus()
          : wirkung === 'ausgeschlossen'
            ? this.state.exclStatus()
            : this.state.markierungStatus();
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

  // ── Instanz-Modus: Angabe, Zweigwahl, Dummy-Befuellung ──────────────

  /**
   * Optionalen Container **angeben**: der Ast gehoert in die Nachricht, der
   * Durchlauf steigt in ihn ab. Modelltechnisch dieselbe Wirkung `pflicht` wie
   * frueher das "aufnehmen" — nur gibt es kein Gegenstueck mehr: wer nichts
   * angibt, sagt nichts (ADR 0016).
   */
  gibAn(path: string): void {
    const st = this.state.pflichtStatus();
    if (st) this.state.setElementProfile(path, { status: st.id });
  }

  /**
   * Grund, warum sich die Angabe an diesem Container **nicht zuruecknehmen**
   * laesst — null, wenn sie frei ist. Drei Gruende: die gebundene Fassung setzt
   * den Ast zwingend, sie verlangt eine Mindestanzahl, oder es stehen bereits
   * Werte darunter (dann entscheidet der Wert, nicht die Ruecknahme).
   */
  angabeSperre(path: string): string | null {
    if (this.state.profilWirkungGeerbt(path) === 'pflicht')
      return 'Die Profilierung setzt dieses Element zwingend.';
    const kard = this.kardSperreWeglassen(path);
    if (kard) return kard;
    if (this.hatInhalt(path))
      return 'Der Teilbaum enthält Angaben — zum Weglassen zuerst die Werte darunter löschen.';
    return null;
  }

  /**
   * Angabe zuruecknehmen ("nicht angeben"): der Status faellt weg, der Ast ist
   * wieder uebergangen. Kein Ausschluss — der Durchlauf haelt bewusst nicht
   * fest, was **nicht** angegeben wurde. Gibt false zurueck, wenn eine Sperre
   * greift (`angabeSperre` nennt den Grund).
   */
  gibNichtAn(path: string): boolean {
    if (this.angabeSperre(path)) return false;
    this.state.setElementProfile(path, { status: undefined });
    return true;
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

  // ── Verweise: Ziel-Vorkommen statt Nummer (Issue #30) ────────────────

  /**
   * Die waehlbaren Ziele eines Verweises. Gefiltert nach der Verweis-Art
   * (`REF_TARGETS`) und, wo die **Profilierung** ein Ziel festlegt, auf die
   * Vorkommen genau dieser Auspraegung eingeengt (Spec #30). Der Traeger-Pfad
   * ist der Knoten, an dem das Verweisziel haengt — nicht das Nummern-Blatt
   * darunter (`refTraeger`).
   */
  verweisZiele(traegerPfad: string): { path: string; label: string }[] {
    const it = this.nav.findItemByPath(traegerPfad);
    if (!it || it.kind !== 'el') return [];
    const kind = refKindEff(it.node);
    if (!kind) return [];
    // Die Festlegung der Profilierung, nicht die eigene Wahl: `vorgabeRefZiel`
    // bleibt auch nach der Entscheidung die Grenze.
    return this.state.refZielKandidaten(kind, this.state.vorgabeRefZiel(traegerPfad));
  }

  /**
   * Verweisziel setzen — und die Nummer an **beiden** Enden vergeben: am
   * Nummern-Blatt des Verweises (`ref.…`) und am Nummern-Blatt des Ziels
   * (`rollennummer`/`beteiligtennummer`). Genau das nimmt dem Anwender die
   * Nummernvergabe ab (Spec #30: "der Anwender waehlt das Ziel, die Nummern
   * vergibt das Werkzeug"), und nur so tragen beide Enden der erzeugten
   * Nachricht denselben Wert.
   */
  waehleVerweisZiel(traegerPfad: string, zielPfad: string | null): void {
    this.state.setElementProfile(traegerPfad, { refZiel: zielPfad || undefined });
    if (!zielPfad) return;
    const num = this.state.auspNumber(zielPfad);
    if (num == null) return;
    const wert = String(num);
    const blatt = this.verweisBlatt(traegerPfad);
    if (blatt) this.state.setElementProfile(blatt, { beispiel: wert });
    const gegenstueck = this.nummernBlatt(zielPfad);
    if (gegenstueck) this.state.setElementProfile(gegenstueck, { beispiel: wert });
  }

  /**
   * Verweise mit **genau einem** zulaessigen Ziel ohne Zutun aufloesen — beim
   * Start des gebundenen Durchlaufs aufgerufen. Damit ist der Punkt erledigt,
   * bevor der Anwender ihn erreicht (Spec #30). Bereits gesetzte Ziele bleiben
   * unberuehrt. Gibt die Anzahl aufgeloester Verweise zurueck.
   */
  loeseEindeutigeVerweise(): number {
    const root = this.state.root();
    if (!root) return 0;
    let n = 0;
    this.tree.walkProfil(root, ({ node: c, ausp }) => {
      if (ausp) return true; // Vorkommen-Kontext: Kinder dort weiter
      if (c.erweiterung) return false; // wie bisher: nur Schema-Kinder
      if (this.state.vorgabeSchliesstAus(c.path)) return false;
      if (refTraeger(c) === c) {
        if (!this.state.refZielOf(c.path)) {
          const ziele = this.verweisZiele(c.path);
          if (ziele.length === 1) {
            this.waehleVerweisZiel(c.path, ziele[0]!.path);
            n++;
          }
        }
        return false; // unterhalb des Traegers liegt nur das Nummern-Blatt
      }
      return true;
    });
    return n;
  }

  /** Das Nummern-Blatt `ref.…` unterhalb des Verweis-Traegers. */
  private verweisBlatt(traegerPfad: string): string | null {
    const it = this.nav.findItemByPath(traegerPfad);
    if (!it || it.kind !== 'el') return null;
    if (this.tree.isLeaf(it.node)) return /^ref\./.test(it.node.name) ? it.node.path : null;
    return this.sucheBlatt(it.node, (c) => /^ref\./.test(c.name));
  }

  /**
   * Das Nummern-Blatt **des Ziels** (`rollennummer`/`beteiligtennummer`) — die
   * Gegenseite des Verweises. Gesucht wird unterhalb des Vorkommens, weil die
   * Nummer je nach Elementart eine Ebene tiefer liegt (Vorbild: die
   * Erzwingungs-Suche im ExportService).
   */
  private nummernBlatt(zielPfad: string): string | null {
    const it = this.nav.findItemByPath(zielPfad);
    if (!it || it.kind !== 'ausp') return null;
    const cn = this.tree.ctxNode(it.parentNode, it.ausp.id);
    return this.sucheBlatt(cn, (c) => c.name === 'rollennummer' || c.name === 'beteiligtennummer');
  }

  /** Breitensuche nach dem ersten passenden Blatt unterhalb des Knotens. */
  private sucheBlatt(start: TreeNode, passt: (n: TreeNode) => boolean): string | null {
    const q: [TreeNode, number][] = [[start, 0]];
    let schritte = 0;
    while (q.length && schritte++ < 400) {
      const [node, tiefe] = q.shift()!;
      if (tiefe > 4 || node.recursive || this.tree.isLeaf(node)) continue;
      this.tree.expandNode(node);
      for (const c of node.children ?? []) {
        if (passt(c) && this.tree.isLeaf(c)) return c.path;
        q.push([c, tiefe + 1]);
      }
    }
    return null;
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
