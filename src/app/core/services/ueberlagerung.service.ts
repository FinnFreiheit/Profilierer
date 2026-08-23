import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Auspraegung } from '../../models/profile.model';
import { CodelistInfo } from '../../models/codelist.model';
import {
  UeberlagerteNachricht,
  Wertbilanz,
  Wertblatt,
  nachrichtFarbe,
} from '../../models/ueberlagerung.model';
import { StateService } from './state.service';
import { NavService } from './nav.service';
import { ValueService } from './value.service';
import { CodelistService } from './codelist.service';
import { LoggerService } from './logger.service';
import { InstanceImportService } from './instance-import.service';
import { ProfileStoreService } from './profile-store.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { istTechnischeAngabe } from './matrix.service';
import { InstanzModell } from '../vorgabe-sicht';
import { XsdIndex } from '../../models/xsd-index.model';
import { ohneVorkommen, segmentKette, vorfahren } from '../util/pfad.util';
import { konkreterPfad, positionsPfad } from '../util/positions-pfad.util';

/** Eine Nachricht als Eingabe der Ueberlagerung. */
export interface UeberlagerungsQuelle {
  id: string;
  name: string;
  xml: string;
}

/** Was eine Nachricht beisteuert: Positionspfad → Wert. */
type Wertkarte = ReadonlyMap<string, string>;

/**
 * Die Nachrichten-Ueberlagerung (#147): alle Testnachrichten eines
 * Kommunikationsszenarios gleichzeitig im Baum — je Wert-Blatt ein
 * zusaetzlicher Kasten pro Nachricht.
 *
 * Der Baum ist dabei **nicht** die Profilierung, sondern der nackte
 * Nachrichtenbaum in der Schema-Ansicht: die Ueberlagerung sagt, was die
 * Nachrichten sagen, nicht was das Szenario vorschreibt. Die Vorkommen fuehrt
 * er als **Vereinigung** — so viele Kaesten, wie die Nachricht mit den meisten
 * hat; zugeordnet wird positionsweise (siehe `positions-pfad.util.ts` und
 * ADR 0015), genau wie in der Merkmals-Matrix.
 *
 * Der Dienst haelt nur die ausgelesenen Werte und die Filterlage; gerendert
 * wird ueber `BaumkastenAnsicht`/`TreeNode`, die ihn befragen.
 */
@Injectable({ providedIn: 'root' })
export class UeberlagerungService {
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly values = inject(ValueService);
  private readonly codelists = inject(CodelistService);
  private readonly log = inject(LoggerService);
  private readonly importer = inject(InstanceImportService);
  private readonly profile = inject(ProfileStoreService);
  private readonly testmessages = inject(TestmessageStoreService);

  // ── Zustand ─────────────────────────────────────────────────────────

  /** Die ueberlagerten Nachrichten in Anzeigereihenfolge (mit Filterlage). */
  readonly nachrichten = signal<readonly UeberlagerteNachricht[]>([]);
  /** Name des Kommunikationsszenarios (Kopfzeile). */
  readonly szenario = signal('');
  /** Laeuft gerade das Laden/Auslesen? */
  readonly laedt = signal(false);
  /**
   * Filter „nur Abweichungen": blendet Aeste aus, in denen alle gewaehlten
   * Nachrichten dasselbe sagen. Bei grossen Nachrichten der eigentliche Nutzen —
   * ohne ihn steht die Uebereinstimmung genauso breit da wie der Unterschied.
   */
  readonly nurAbweichungen = signal(false);

  /** Positionspfad → Wert, je Nachricht. */
  private readonly daten = signal<ReadonlyMap<string, Wertkarte>>(new Map());
  /** Nachricht, zu der die Werte gehoeren (Wechsel beendet die Ueberlagerung). */
  private basis: string | null = null;
  /** Stand der Blatt-Ausrichtung vor der Ueberlagerung (wird zurueckgegeben). */
  private ausrichtungVorher = false;

  /** Laeuft eine Ueberlagerung? */
  readonly aktiv = computed(() => this.nachrichten().length > 0);
  /** Die im Filter gewaehlten Nachrichten — nur sie erscheinen im Baum. */
  readonly gewaehlt = computed(() => this.nachrichten().filter((n) => n.aktiv));

  constructor() {
    // Nachrichtenwechsel (MessagePicker, neues Profil, Rueckweg) beendet die
    // Ueberlagerung: die Werte gehoerten zur alten Nachricht, und ihre Pfade
    // haetten im neuen Baum keinen Ort.
    effect(() => {
      const name = this.state.msgName();
      if (this.aktiv() && name !== this.basis) untracked(() => this.beende());
    });
  }

  // ── Einstieg ────────────────────────────────────────────────────────

  /**
   * Alle Testnachrichten einer Profilierung ueberlagern. Wie bei der
   * Merkmals-Matrix sind die Spalten die Nachrichten mit dieser `profilId` —
   * sie wurden gegen dieselbe Vorgabe gebaut.
   */
  async starteFuerProfil(profilId: string): Promise<void> {
    if (this.laedt()) return;
    this.laedt.set(true);
    try {
      const eintraege = this.testmessages.entries().filter((e) => e.profilId === profilId);
      if (eintraege.length < 2)
        throw new Error(
          eintraege.length === 1
            ? 'Zu diesem Szenario gibt es erst eine Testnachricht — zum Überlagern braucht es mindestens zwei.'
            : 'Zu diesem Szenario gibt es noch keine Testnachrichten.',
        );
      const quellen: UeberlagerungsQuelle[] = [];
      for (const e of [...eintraege].sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
        const xml = await this.testmessages.loadXml(e.id);
        if (xml) quellen.push({ id: e.id, name: e.name, xml });
      }
      const szenario =
        this.profile.entries().find((p) => p.id === profilId)?.name ?? 'Kommunikationsszenario';
      this.baue(quellen, szenario);
    } finally {
      this.laedt.set(false);
    }
  }

  /**
   * Die Ueberlagerung aus fertigen Quellen aufbauen und im Editor oeffnen.
   * Wirft mit sprechendem Grund; der Aufrufer meldet.
   */
  baue(quellen: readonly UeberlagerungsQuelle[], szenario: string): void {
    const idx = this.state.idx();
    if (!idx) throw new Error('Kein Schema geladen.');
    if (quellen.length < 2)
      throw new Error('Zum Überlagern braucht es mindestens zwei Nachrichten.');

    // ── Auslesen (zwei Durchgaenge) ──────────────────────────────────
    // Erst ohne Vorgabe, um die Listen zu finden, die **irgendeine** Nachricht
    // mehrfach fuehrt; dann noch einmal mit dieser Menge, damit auch die
    // Nachricht mit genau einem Vorkommen dort eine Stelle `[1]` bekommt.
    // Sonst traegen dieselben Angaben verschiedene Pfade und erschienen als
    // Unterschied, wo keiner ist (dieselbe Regel wie in der Matrix).
    const erste = this.lese(quellen, idx, undefined);
    if (erste.length < 2)
      throw new Error(
        'Weniger als zwei Nachrichten sind gegen das geladene Schema auswertbar — passt die XJustiz-Version?',
      );
    const vorkommenListen = new Set(
      erste.flatMap((e) => Object.keys(e.modell.auspraegungen).map(ohneVorkommen)),
    );
    const gelesen = vorkommenListen.size ? this.lese(quellen, idx, vorkommenListen) : erste;

    // Alle gegen dieselbe Nachricht: die Wurzel entscheidet. Nachrichten mit
    // anderem Wurzelelement haben im Baum keinen Ort und bleiben draussen.
    const msgName = gelesen[0]!.msgName;
    const passend = gelesen.filter((g) => g.msgName === msgName);
    if (passend.length < 2)
      throw new Error(
        'Die Testnachrichten gehören zu verschiedenen Nachrichtentypen — überlagern lässt sich nur ein Typ.',
      );

    // ── Vereinigung der Vorkommen ────────────────────────────────────
    const vereinigung = this.vereinigeVorkommen(passend.map((p) => p.modell));

    // ── Werte in den Positionsraum heben ─────────────────────────────
    const daten = new Map<string, Wertkarte>();
    const wertPfade = new Set<string>();
    for (const g of passend) {
      const karte = new Map<string, string>();
      for (const [pfad, eintrag] of Object.entries(g.modell.elemente)) {
        const wert = eintrag?.beispiel;
        if (!wert) continue;
        const pos = positionsPfad(pfad, g.modell.auspraegungen);
        karte.set(pos, wert);
        const imBaum = konkreterPfad(pos, vereinigung);
        if (imBaum) wertPfade.add(imBaum);
      }
      daten.set(g.id, karte);
    }

    // ── Baum aufbauen und Ueberlagerung setzen ───────────────────────
    this.nav.loadMessage(msgName); // setzt das Profil zurueck (auch die Vorkommen)
    this.state.activeProfileId.set(null); // kein Autosave: hier wird nichts profiliert
    this.state.auspraegungen.set(vereinigung);
    this.state.guided.set(false);
    // Die Ueberlagerung ist ein Sonderfall der Schema-Ansicht: betrachten,
    // nichts speichern, keine Profilier-Bedienelemente.
    this.state.schemaView.set(true);
    this.state.readOnly.set(true);
    const root = this.state.root();
    const offen = new Set<string>(root ? [root.path] : []);
    for (const pfad of wertPfade) for (const teil of segmentKette(pfad)) offen.add(teil);
    this.state.open.set(offen);
    if (root) this.state.selItem.set({ kind: 'el', node: root });

    this.basis = msgName;
    this.szenario.set(szenario);
    this.nurAbweichungen.set(false);
    this.daten.set(daten);
    this.nachrichten.set(
      passend.map((g, i) => ({
        id: g.id,
        name: g.name,
        kuerzel: 'N' + (i + 1),
        farbe: nachrichtFarbe(i),
        aktiv: true,
      })),
    );
    // Blaetter ausrichten: der Vergleich laeuft senkrecht. Ohne die Ausrichtung
    // sitzt jeder Wert-Kasten dort, wo sein Blatt endet — die Werte stehen im
    // Zickzack, und genau das Nebeneinander, das die Ueberlagerung ausmacht,
    // muss man sich zusammensuchen. Der Schalter bleibt bedienbar.
    this.ausrichtungVorher = this.state.alignLeaves();
    this.state.alignLeaves.set(true);
    this.state.view.set('editor');
    // Codelisten im Hintergrund: belegte Codes bekommen ihren Klartext.
    void this.codelists.ensureUsedCodelists();
  }

  /** Die Ueberlagerung beenden — der Baum bleibt als Schema-Ansicht stehen. */
  beende(): void {
    // Die Blatt-Ausrichtung war eine Leihgabe an die Ueberlagerung: zurueck auf
    // den vorherigen Stand — es sei denn, sie wurde inzwischen von Hand
    // abgeschaltet, dann gilt diese Entscheidung.
    if (this.state.alignLeaves()) this.state.alignLeaves.set(this.ausrichtungVorher);
    this.nachrichten.set([]);
    this.daten.set(new Map());
    this.szenario.set('');
    this.nurAbweichungen.set(false);
    this.basis = null;
  }

  // ── Filter ──────────────────────────────────────────────────────────

  schalte(id: string): void {
    this.nachrichten.update((list) =>
      list.map((n) => (n.id === id ? { ...n, aktiv: !n.aktiv } : n)),
    );
  }

  setzeAlle(aktiv: boolean): void {
    this.nachrichten.update((list) => list.map((n) => ({ ...n, aktiv })));
  }

  // ── Anzeige-Fragen ──────────────────────────────────────────────────

  /**
   * Die Wert-Kaesten unter einem Blatt — leer, wenn keine gewaehlte Nachricht
   * dort etwas sagt. Ein Blatt, an dem nirgends ein Wert steht, bleibt damit
   * ein schlichtes Blatt; sonst haengte an jedem Element des Standards eine
   * Reihe leerer Kaesten.
   */
  blaetter(pfad: string, codelist: CodelistInfo | null = null): Wertblatt[] {
    const gewaehlt = this.gewaehlt();
    if (!gewaehlt.length) return [];
    const werte = this.werteAn(pfad, gewaehlt);
    if (!werte.some((w) => w !== null)) return [];
    const referenz = this.referenzwert(werte);
    // Technische Kopfangaben tragen nie eine Marke; sind sich alle einig,
    // faellt sie ohnehin weg (dann ist ihr Wert die Mehrheit).
    const technisch = this.istTechnisch(pfad);
    return gewaehlt.map((n, i) => {
      const wert = werte[i] ?? null;
      return {
        id: n.id,
        name: n.name,
        kuerzel: n.kuerzel,
        farbe: n.farbe,
        wert,
        label: wert && codelist ? this.values.labelFor(codelist, wert) : null,
        // Ohne eindeutige Mehrheit (referenz === undefined) traegt jeder die
        // Marke: es gibt keinen Wert, von dem der andere abwiche.
        abweichend: !technisch && (referenz === undefined || wert !== referenz),
      };
    });
  }

  /** Kurzfassung am Blatt selbst — die Aussage auch ohne die Kaesten daneben. */
  bilanz(pfad: string): Wertbilanz | null {
    const gewaehlt = this.gewaehlt();
    if (!gewaehlt.length) return null;
    const werte = this.werteAn(pfad, gewaehlt);
    const belegt = werte.filter((w) => w !== null);
    if (!belegt.length) return null;
    const verschieden = new Set(belegt).size;
    return {
      belegt: belegt.length,
      gesamt: werte.length,
      verschieden,
      abweichend: !this.istTechnisch(pfad) && new Set(werte).size > 1,
      sagend: belegt.length < werte.length || verschieden > 1,
    };
  }

  /**
   * Verdeckt der Filter „nur Abweichungen" diesen Kasten? Sichtbar bleibt, was
   * selbst abweicht oder eine Abweichung unter sich hat — sonst waere der Weg
   * dorthin zugeklappt.
   *
   * Ohne Abweichung bleibt der Filter **wirkungslos**: sonst raeumte er bei
   * einer einzeln gewaehlten Nachricht (oder bei zwei gleichen) den ganzen Baum
   * leer, und der leere Baum saehe wie ein Fehler aus statt wie die Antwort
   * „es gibt keinen Unterschied". Die Zahl im Menue sagt sie ausdruecklich.
   */
  verdeckt(pfad: string): boolean {
    if (!this.aktiv() || !this.nurAbweichungen()) return false;
    const stellen = this.abweichungsStellen();
    return stellen.length > 0 && !this.abweichungsPfade().has(pfad);
  }

  /** Zahl der Stellen mit Abweichung — die Aussage des Filters in einer Zahl. */
  readonly abweichungen = computed(() => this.abweichungsStellen().length);

  // ── Ableitungen ─────────────────────────────────────────────────────

  /**
   * Die Positionspfade, an denen sich die gewaehlten Nachrichten unterscheiden
   * (fehlende Angabe zaehlt als Unterschied). Technische Kopfangaben bleiben
   * aussen vor: sie weichen zwangslaeufig ab und stuenden sonst als einzige
   * „Unterschiede" da, wenn die Nachrichten fachlich gleich sind.
   */
  private readonly abweichungsStellen = computed<string[]>(() => {
    const gewaehlt = this.gewaehlt();
    if (gewaehlt.length < 2) return [];
    const daten = this.daten();
    const karten = gewaehlt.map((n) => daten.get(n.id));
    const stellen = new Set<string>();
    for (const karte of karten) for (const pos of karte?.keys() ?? []) stellen.add(pos);
    const out: string[] = [];
    for (const pos of stellen) {
      if (istTechnischeAngabe(pos)) continue;
      const werte = new Set(karten.map((k) => k?.get(pos) ?? null));
      if (werte.size > 1) out.push(pos);
    }
    return out;
  });

  /** Dieselben Stellen als Baumpfade, samt aller Vorfahren (Sichtbarkeitsfilter). */
  private readonly abweichungsPfade = computed<ReadonlySet<string>>(() => {
    const listen = this.state.auspraegungen();
    const set = new Set<string>();
    const root = this.state.root();
    if (root) set.add(root.path);
    for (const pos of this.abweichungsStellen()) {
      const pfad = konkreterPfad(pos, listen);
      if (!pfad) continue;
      for (const teil of segmentKette(pfad)) set.add(teil);
    }
    return set;
  });

  /**
   * Vorfahren-Aggregat: Baumpfad → Zahl der abweichenden Stellen **darunter**
   * (der Pfad selbst zaehlt nicht mit). Muster `belegtAnc`/`valAnc` — und der
   * eigentliche Wegweiser: im zugeklappten Ast sagt sonst nichts, wo etwas zu
   * holen ist, und „nur Abweichungen" ist ein Alles-oder-nichts-Schalter.
   */
  private readonly abweichungsAnc = computed<ReadonlyMap<string, number>>(() => {
    const listen = this.state.auspraegungen();
    const m = new Map<string, number>();
    for (const pos of this.abweichungsStellen()) {
      const pfad = konkreterPfad(pos, listen);
      if (!pfad) continue;
      for (const a of vorfahren(pfad)) m.set(a, (m.get(a) ?? 0) + 1);
    }
    return m;
  });

  /** Abweichende Stellen im Teilbaum unter `pfad` (0 = keine). */
  abweichungenDarunter(pfad: string): number {
    return this.abweichungsAnc().get(pfad) ?? 0;
  }

  /** Die Werte der gewaehlten Nachrichten an einem Baumpfad (null = keine Angabe). */
  private werteAn(pfad: string, gewaehlt: readonly UeberlagerteNachricht[]): (string | null)[] {
    const pos = positionsPfad(pfad, this.state.auspraegungen());
    const daten = this.daten();
    return gewaehlt.map((n) => daten.get(n.id)?.get(pos) ?? null);
  }

  /**
   * Der Wert, gegen den die Kaesten gelesen werden: der **eindeutig**
   * haeufigste. Alles andere — auch die fehlende Angabe — ist die Abweichung,
   * und so sticht die Ausnahme heraus, statt dass beide Seiten blinken.
   *
   * `undefined`, wenn es keine Mehrheit gibt (zwei Nachrichten mit zwei Werten,
   * drei mit dreien): dann ist keiner der Massstab. Vorher gewann bei
   * Gleichstand der zuerst genannte — bei genau zwei Nachrichten, dem
   * Normalfall, trug damit **immer** die zweite die Marke, als waere sie die
   * Abweichlerin. Eine Reihenfolge ist keine Aussage.
   *
   * Die fehlende Angabe zaehlt bewusst nicht mit: „drei haben nichts, einer hat
   * etwas" — der eine Wert ist die Auffaelligkeit, nicht die Norm.
   */
  private referenzwert(werte: readonly (string | null)[]): string | undefined {
    const zaehler = new Map<string, number>();
    for (const w of werte) if (w !== null) zaehler.set(w, (zaehler.get(w) ?? 0) + 1);
    let referenz: string | undefined;
    let max = 0;
    let eindeutig = false;
    for (const [wert, n] of zaehler) {
      if (n > max) {
        max = n;
        referenz = wert;
        eindeutig = true;
      } else if (n === max) {
        eindeutig = false;
      }
    }
    return eindeutig ? referenz : undefined;
  }

  /** Technische Kopfangabe? Gepruefte wird der Positionspfad (wie in der Matrix). */
  private istTechnisch(pfad: string): boolean {
    return istTechnischeAngabe(pfad);
  }

  // ── Auslesen und Vereinigen ─────────────────────────────────────────

  /** Liest die Quellen aus; nicht auswertbare fallen mit Protokolleintrag weg. */
  private lese(
    quellen: readonly UeberlagerungsQuelle[],
    idx: XsdIndex,
    vorkommenListen: Set<string> | undefined,
  ): { id: string; name: string; msgName: string; modell: InstanzModell }[] {
    const out: { id: string; name: string; msgName: string; modell: InstanzModell }[] = [];
    for (const q of quellen) {
      try {
        const a = this.importer.auswerten(q.xml, idx, vorkommenListen ? { vorkommenListen } : {});
        out.push({ id: q.id, name: q.name, msgName: a.msgName, modell: a.modell });
      } catch (e) {
        this.log.warn('Überlagerung', `„${q.name}" ist nicht auswertbar`, e);
      }
    }
    return out;
  }

  /**
   * Die Vereinigung der Vorkommen: an jeder Stelle so viele Kaesten, wie die
   * Nachricht mit den meisten Vorkommen dort fuehrt. Wo eine Nachricht weniger
   * hat, bleibt der Kasten leer — das ist die Aussage („hat keinen zweiten
   * Beteiligten"), nicht ein Loch.
   */
  private vereinigeVorkommen(modelle: readonly InstanzModell[]): Record<string, Auspraegung[]> {
    const anzahl = new Map<string, number>();
    for (const m of modelle)
      for (const [traeger, liste] of Object.entries(m.auspraegungen)) {
        const pos = positionsPfad(traeger, m.auspraegungen);
        anzahl.set(pos, Math.max(anzahl.get(pos) ?? 0, liste.length));
      }
    // Aeussere Listen zuerst: der Baumpfad einer inneren Liste traegt die ids
    // der aeusseren, die dafuer schon stehen muessen.
    const stellen = [...anzahl.keys()].sort((a, b) => a.split('/').length - b.split('/').length);
    const vereinigung: Record<string, Auspraegung[]> = {};
    let lauf = 0;
    for (const pos of stellen) {
      const n = anzahl.get(pos)!;
      if (n < 2) continue; // ein einzelnes Vorkommen wird ohne Kasten gefuehrt
      const pfad = konkreterPfad(pos, vereinigung);
      if (!pfad) continue; // liegt in einem Vorkommen, das es im Baum nicht gibt
      vereinigung[pfad] = Array.from({ length: n }, (_, i) => ({
        id: 'u' + ++lauf,
        name: 'Vorkommen ' + (i + 1),
      }));
    }
    return vereinigung;
  }
}
