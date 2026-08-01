import { Auspraegung, ElementProfile, ProfileDoc, Wirkung } from '../models/profile.model';
import { ohneVorkommen, vorfahren } from './util/pfad.util';

/**
 * Die Entscheidungsschicht eines Durchlaufs: was der Anwender selbst gesetzt
 * hat. Im Werkzeug sind das die Signals des Stores, im zustandslosen Abgleich
 * die Maps eines gespeicherten Eintrags — beide erfuellen dieses Interface.
 */
export interface InstanzModell {
  elemente: Record<string, ElementProfile>;
  auspraegungen: Record<string, Auspraegung[]>;
}

/**
 * Die **eine** Lesart der eingefrorenen Profilkopie (Vorgabe) — das Modul, das
 * die Aufloesungsdisziplin besitzt. Vorher war sie zweimal implementiert
 * (privat im StateService und als Kopie im Konformitaets-Abgleich) und die
 * Kopien divergierten bereits: der Abgleich las die Kardinalitaet roh und die
 * Wirkung eintragsweise, der Store geerbt bzw. feldweise — Sperre und
 * Verstossliste konnten sich widersprechen.
 *
 * Drei Aufloesungsregeln, hier und nur hier:
 *
 * 1. **Quellpfad** (`vonId`, #28): Vorkommen, die als Kopie einer profilierten
 *    Auspraegung entstanden sind, tragen eine Laufzeit-id, die die Vorgabe
 *    nicht kennt — jeder Lesezugriff schreibt sie segmentweise auf die id der
 *    Quelle zurueck. Die Vorfahren werden im **eigenen** Pfadraum
 *    nachgeschlagen und im **Vorgabe**-Pfadraum aufgebaut.
 * 2. **Erben** (#59): was generisch festgelegt ist, gilt in jedem Vorkommen
 *    (`ohneVorkommen`-Rueckfall) — nur wo die Vorgabe den Vorkommen-Pfad
 *    selbst fuehrt, gewinnt der exakte Pfad. Fuer Eintraege gilt der Rueckfall
 *    **eintragsweise** (`eintragGeerbt` — Werte, Anmerkung, Beispiel,
 *    Kardinalitaet lesen dann ihr Feld), fuer die Wirkung **feldweise**
 *    (`wirkungGeerbt`) — ein pfadgenauer Eintrag ohne Status verdeckt die
 *    generische Wirkung nicht.
 * 3. **Kein Mischen**: sobald der Durchlauf an einem Pfad eigene Vorkommen
 *    fuehrt, ist seine Liste komplett massgeblich (`auspsEffektiv`).
 *
 * Zwei Adapter teilen sich den Seam: der StateService (Signals) und der
 * KonformitaetService (rohe Maps eines gespeicherten Eintrags). Die Klasse
 * selbst ist pur — kein Angular, keine Signals, kein Zustand ausser den beiden
 * hereingereichten Dokumenten.
 */
export class VorgabeSicht {
  constructor(
    /** Die eingefrorene Profilkopie — die Aussage, gegen die gelesen wird. */
    readonly doc: ProfileDoc,
    /** Die Entscheidungsschicht des Durchlaufs (fuer Quellpfad und Effektiv-Listen). */
    private readonly instanz: InstanzModell,
  ) {}

  /**
   * Der Pfad, wie ihn die Vorgabe kennt: Kopien (`vonId`) zeigen segmentweise
   * auf ihre Quelle. Ketten sind flach (die Kopie einer Kopie traegt die id
   * der profilierten Auspraegung), darum genuegt ein Schritt je Segment.
   */
  quellPfad(pfad: string): string {
    if (!pfad.includes('@')) return pfad;
    let eigen = '';
    let ziel = '';
    for (const seg of pfad.split('/')) {
      const at = seg.lastIndexOf('@');
      const name = at < 0 ? seg : seg.slice(0, at);
      const id = at < 0 ? null : seg.slice(at + 1);
      const listeEigen = eigen ? eigen + '/' + name : name;
      const listeZiel = ziel ? ziel + '/' + name : name;
      if (id === null) {
        eigen = listeEigen;
        ziel = listeZiel;
        continue;
      }
      const von = this.instanz.auspraegungen[listeEigen]?.find((a) => a.id === id)?.vonId;
      eigen = listeEigen + '@' + id;
      ziel = listeZiel + '@' + (von ?? id);
    }
    return ziel;
  }

  /** Der Eintrag der Vorgabe: pfadgenau, sonst ueber den Quellpfad. */
  eintrag(pfad: string): ElementProfile | null {
    return this.doc.elemente[pfad] ?? this.doc.elemente[this.quellPfad(pfad)] ?? null;
  }

  /**
   * Derselbe Eintrag mit Vorkommen-Erbe: faellt **eintragsweise** auf den
   * generischen Pfad zurueck. Lesart fuer Werte, Anmerkung, Beispielwert,
   * Verweisziel und Kardinalitaet.
   */
  eintragGeerbt(pfad: string): ElementProfile | null {
    return this.eintrag(pfad) ?? this.eintrag(ohneVorkommen(pfad)) ?? null;
  }

  /**
   * Die Wirkung der Vorgabe, pfadgenau (inkl. Quellpfad) — aufgeloest ueber
   * **ihre** Stufenliste: Stufen sind je Profilierung frei konfigurierbar,
   * dieselbe id kann in beiden Schichten etwas anderes bedeuten.
   */
  wirkung(pfad: string): Wirkung | null {
    const id = this.eintrag(pfad)?.status;
    return (id && this.doc.statuses.find((s) => s.id === id)?.wirkung) || null;
  }

  /**
   * Die Wirkung mit Vorkommen-Erbe — **feldweise**, nicht eintragsweise: ein
   * pfadgenauer Eintrag, der nur Anmerkung oder Beispiel traegt, verdeckt die
   * generische Festlegung nicht.
   */
  wirkungGeerbt(pfad: string): Wirkung | null {
    return this.wirkung(pfad) ?? this.wirkung(ohneVorkommen(pfad));
  }

  /** Die Auspraegungsliste der Vorgabe: pfadgenau, sonst ueber den Quellpfad. */
  ausps(listPfad: string): Auspraegung[] | null {
    return (
      this.doc.auspraegungen[listPfad] ?? this.doc.auspraegungen[this.quellPfad(listPfad)] ?? null
    );
  }

  /**
   * Die effektive Vorkommensliste: die eigene des Durchlaufs, sonst die der
   * Vorgabe — je Pfad fuer die **ganze** Liste, kein Mischen beider Schichten.
   */
  auspsEffektiv(listPfad: string): Auspraegung[] | null {
    return this.instanz.auspraegungen[listPfad] ?? this.ausps(listPfad);
  }

  /**
   * Alle Vorkommenslisten in der Lesart des Durchlaufs: die eigenen, ergaenzt
   * um die der Vorgabe an Pfaden ohne eigene Liste — fuer Konsumenten, die
   * ueber *alle* Listen laufen muessen (Verweisziele, Pflicht-Vorbelegung,
   * Instanz-Export, #28).
   */
  alleListen(): [string, Auspraegung[]][] {
    const out: [string, Auspraegung[]][] = Object.entries(this.instanz.auspraegungen);
    for (const [pfad, liste] of Object.entries(this.doc.auspraegungen)) {
      if (!this.instanz.auspraegungen[pfad]) out.push([pfad, liste]);
    }
    return out;
  }

  /**
   * Der Pfad des Ausschlusses, der diesen Pfad trifft — er selbst oder der
   * naechstgelegene Vorfahr (Grenzen '/' und '@': der Ausschluss vererbt sich
   * ueber Vorkommen-Grenzen); null, wenn nichts ausschliesst. Reine Aussage
   * der Vorgabe — ob eine eigene Entscheidung des Durchlaufs die Sperre am
   * konkreten Pfad aufhebt, ist Sache des Stores, nicht der Lesart.
   */
  ausschlussQuelle(pfad: string): string | null {
    for (const kandidat of [pfad, ...vorfahren(pfad).reverse()]) {
      if (this.wirkungGeerbt(kandidat) === 'ausgeschlossen') return this.eintragPfad(kandidat);
    }
    return null;
  }

  /**
   * Der Pfad, an dem der wirksame Eintrag zu `pfad` tatsaechlich **steht** —
   * pfadgenau, ueber die Quelle einer Kopie, oder am generischen Pfad. Die
   * Meldung des Abgleichs nennt damit das Element, das die Festlegung traegt,
   * nicht das Vorkommen, das sie nur erbt.
   */
  private eintragPfad(pfad: string): string {
    if (this.doc.elemente[pfad]) return pfad;
    const quelle = this.quellPfad(pfad);
    if (this.doc.elemente[quelle]) return quelle;
    return ohneVorkommen(pfad);
  }

  /**
   * Zahl der Vorkommen eines Elements in der Nachricht — die Zaehlkonvention
   * aus ADR 0015: benannte Vorkommen zaehlen; sonst steht der generische
   * Unterbaum fuer eines, es sei denn, die Nachricht laesst das Element mit
   * eigener Entscheidung weg (aufgeloest ueber die Stufenliste der Vorgabe —
   * die Stufenliste der Nachricht ist die des Profils, aus dem sie entstand;
   * unbekannte ids zaehlen wie "keine Aussage").
   */
  vorkommenAnzahl(pfad: string): number {
    const liste = this.auspsEffektiv(pfad);
    if (liste?.length) return liste.length;
    const eigen = this.instanz.elemente[pfad]?.status;
    if (eigen && this.doc.statuses.find((s) => s.id === eigen)?.wirkung === 'ausgeschlossen')
      return 0;
    return 1;
  }

  /**
   * Die Pfade, unter denen ein Festlegungs-Pfad in der Nachricht tatsaechlich
   * auftritt: er selbst, wenn sein Elternelement keine Vorkommen fuehrt —
   * sonst je Vorkommen einer. Ohne diese Aufloesung liefe jede Pruefung am
   * generischen Pfad ins Leere, den der Baum gar nicht rendert (#28).
   * Bewusst nur eine Listen-Ebene tief — dieselbe Grenze wie die
   * Materialisierung beim Start.
   */
  instanzPfade(pfad: string): string[] {
    const i = pfad.lastIndexOf('/');
    if (i < 0) return [pfad];
    const eltern = pfad.slice(0, i);
    const rest = pfad.slice(i);
    const liste = this.auspsEffektiv(eltern);
    if (!liste?.length) return [pfad];
    return liste.map((a) => `${eltern}@${a.id}${rest}`);
  }
}
