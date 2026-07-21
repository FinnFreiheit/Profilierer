import { Injectable, Signal, computed, inject } from '@angular/core';
import { TreeNode, itemPath } from '../../models/node.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';
import { PlaceholderNode, ValueService } from './value.service';

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
    const instanz = this.instanzModus();
    // Instanz-Modus: Aufnahme-Wirkungen und Inhalte steuern den Abstieg.
    if (instanz) this.state.elemente();
    const excl = new Set(this.exclKey() ? this.exclKey().split('\n') : []);
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
          });
        } else if (n.min === '0') {
          // Optionale Gruppe: eigener Punkt, sonst blieben ihre Pflicht-Kinder unentschieden.
          punkte.push({ path: n.path, art: 'element', seq: seqOf.get(n.path)! });
        }
        if (excl.has(n.path)) return; // abgeschnitten
        this.tree.expandNode(n);
        for (const c of n.children ?? []) {
          // Instanz: nur in gewaehlte Zweige bzw. aufgenommene optionale Gruppen.
          if (instanz && n.model === 'choice' && !steigAb(c.path)) continue;
          if (instanz && n.model !== 'choice' && n.min === '0' && !steigAb(n.path)) continue;
          visit(c, depth + 1);
        }
        return;
      }

      seqOf.set(n.path, seq++);
      const optional = n.min === '0' || n.inChoice;
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
            punkte.push({ path: n.path, art: 'wert', seq: seqOf.get(n.path)!, leaf: true, pflicht: true });
            merkeWertNode(n, n.path);
          }
        } else if (optional) {
          punkte.push({ path: n.path, art: 'element', seq: seqOf.get(n.path)!, leaf });
          if (leaf) merkeWertNode(n, n.path);
        } else if (leaf) {
          // Unbedingtes Pflicht-Blatt: Wert noetig.
          punkte.push({ path: n.path, art: 'wert', seq: seqOf.get(n.path)!, leaf: true, pflicht: true });
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
          seqOf.set(cn.path, seq++);
          const cnLeaf = this.tree.isLeaf(cn);
          const cnChoice = !cnLeaf && !cn.recursive && (this.tree.expandNode(cn), cn.model === 'choice');
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
          if (cnLeaf) continue;
          this.tree.expandNode(cn);
          for (const c of cn.children ?? []) {
            if (instanz && cnChoice && !steigAb(c.path)) continue;
            visit(c, depth + 2);
          }
        }
        return;
      }

      if (leaf) return;
      this.tree.expandNode(n);
      for (const c of n.children ?? []) {
        if (instanz && istChoiceEl && !steigAb(c.path)) continue;
        visit(c, depth + 1);
      }
    };

    // Wurzel implizit: Start bei den Kindern der Nachricht.
    this.tree.expandNode(root);
    seqOf.set(root.path, seq++);
    for (const c of root.children ?? []) visit(c, 1);
    return { punkte, seqOf, wertNodes };
  });

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

  // ── Spur-Navigation ─────────────────────────────────────────────────

  /**
   * Naechster offener Punkt in Dokumentreihenfolge nach `fromPath` (exklusiv),
   * mit einmaligem Wrap-around an den Anfang; null wenn alles entschieden.
   */
  nextOpen(fromPath?: string | null): string | null {
    const { punkte, seqOf } = this.walk();
    const offen = punkte.filter((p) => !this.istEntschiedenPunkt(p));
    if (!offen.length) return null;
    const fromSeq = fromPath != null ? seqOf.get(fromPath) ?? -1 : -1;
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
    this.state.setElementProfile(path, { status: st.id });
    this.gotoNextOpen();
    return true;
  }

  private selPath(): string | null {
    const it = this.state.selItem();
    return it ? itemPath(it) : null;
  }

  private selSeq(seqOf: Map<string, number>): number {
    const p = this.selPath();
    return p != null ? seqOf.get(p) ?? -1 : -1;
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
   */
  setzeAufnahme(path: string, aufnehmen: boolean | null): void {
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
    for (const k of p.kinder ?? []) {
      this.state.setElementProfile(k, { status: k === zweigPath ? pflicht.id : excl.id });
    }
    // Benanntes (nicht-synthetisches) Auswahl-Element: Aufnahme mit der Wahl.
    const it = this.nav.findItemByPath(auswahlPath);
    if (it && it.kind === 'el' && !it.node.synthetic && this.state.wirkungOf(auswahlPath) !== 'pflicht') {
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
