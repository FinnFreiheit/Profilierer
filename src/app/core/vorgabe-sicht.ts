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
   * Unterbaum fuer **eines**.
   *
   * Ob er das wirklich tut, steht allerdings nicht in den beiden Dokumenten:
   * es haengt an Schema-Kardinalitaet und Serialisierung. `istEnthalten`
   * reicht die Antwort aus der Umgebung herein — die **eine** Regel
   * (`core/enthalten.ts`), die auch der Export anwendet. Ohne sie gilt der
   * Rueckfall auf die Entscheidungsschicht: ausdruecklich ausgeschlossen zaehlt
   * null, alles Uebrige eins (aufgeloest ueber die Stufenliste der Vorgabe —
   * die Stufenliste der Nachricht ist die des Profils, aus dem sie entstand;
   * unbekannte ids zaehlen wie "keine Aussage").
   *
   * Der Rueckfall ist die schwaechere Auskunft: er zaehlt ein Element als
   * vorhanden, das der Export gar nicht schreibt. Er bleibt fuer Aufrufer ohne
   * Schema-Zugang, statt zu raten — wer die Umgebung liefert, bekommt die
   * belastbare Zahl.
   *
   * Bewusst NICHT dasselbe wie `GuidedService.vorkommenAnzahl`: der Durchlauf
   * zaehlt auf der Entscheidungsschicht (inkl. `wirkungOf` und
   * `vorgabeGesperrt` der laufenden Sitzung), diese Lesart auf den beiden
   * Dokumenten — zwei Ebenen derselben Konvention, keine Kopien.
   */
  vorkommenAnzahl(pfad: string, istEnthalten?: (pfad: string) => boolean | null): number {
    const liste = this.auspsEffektiv(pfad);
    if (liste?.length) return liste.length;
    const auskunft = istEnthalten?.(pfad);
    if (auskunft != null) return auskunft ? 1 : 0;
    const eigen = this.instanz.elemente[pfad]?.status;
    if (eigen && this.doc.statuses.find((s) => s.id === eigen)?.wirkung === 'ausgeschlossen')
      return 0;
    return 1;
  }

  /**
   * Die Pfade, unter denen ein Festlegungs-Pfad in der Nachricht tatsaechlich
   * auftritt: **jede** Vorfahren-Liste faechert je Vorkommen auf. Ohne diese
   * Aufloesung liefe jede Pruefung am generischen Pfad ins Leere, den der Baum
   * gar nicht rendert (#28). Frueher wurde nur die letzte Listen-Ebene
   * expandiert — bei zweistufiger Schachtelung (`m/bet/adr/ort`) entstanden
   * Phantompfade (`m/bet/adr@x/ort` statt `m/bet@a1/adr@x/ort`), auf die der
   * Bericht zeigte, obwohl sie niemand rendert (Deep-Review-Befund).
   */
  instanzPfade(pfad: string, zuordenbar?: (listPfad: string) => boolean): string[] {
    const segs = pfad.split('/');
    let front: string[] = [segs[0]!];
    for (let i = 1; i < segs.length; i++) {
      const naechste: string[] = [];
      for (const f of front) {
        const el = f + '/' + segs[i]!;
        // Das Zielelement selbst wird nicht aufgefaechert — seine eigenen
        // Vorkommen sind die Zaehlgroesse (`vorkommenAnzahl`), kein Pfadraum.
        const liste = i < segs.length - 1 ? this.auspsEffektiv(el) : null;
        if (liste?.length && this.faechernErlaubt(el, zuordenbar)) {
          for (const a of liste) naechste.push(`${el}@${a.id}`);
        } else {
          naechste.push(el);
        }
      }
      front = naechste;
    }
    return front;
  }

  /**
   * Darf ueber die Vorkommen dieser Liste aufgefaechert werden?
   *
   * Eigene Vorkommen des Durchlaufs: immer — sie sind der Pfadraum, in dem
   * seine Werte liegen. Die Liste der **Vorgabe** dagegen nur, wenn ihre
   * Vorkommen zuordenbar sind. Eine aus XML gewonnene Nachricht kann sie nicht
   * zuordnen (ein Vorkommen traegt dort keinen Namen), und wo sie selbst keine
   * Liste fuehrt — bei genau **einem** Vorkommen legt der Bind-Walk keine an —
   * liegen ihre Werte am generischen Pfad. Ueber die ids der Vorgabe
   * aufgefaechert entstuenden Pfade, die die Nachricht nie tragen kann: der
   * Abgleich meldete sie als fehlend und der Sprung im Bericht landete auf der
   * Wurzel, weil der Baum sie nicht kennt.
   *
   * Ohne `zuordenbar` (gefuehrter Durchlauf) gilt das Erbe unveraendert: dort
   * materialisiert der Durchlauf die Vorkommen der Vorgabe unter deren ids.
   */
  private faechernErlaubt(listPfad: string, zuordenbar?: (listPfad: string) => boolean): boolean {
    if (this.instanz.auspraegungen[listPfad]) return true;
    return !zuordenbar || zuordenbar(listPfad);
  }

  /**
   * Kann die Nachricht diesen Pfad ueberhaupt tragen? Jedes `@id`-Segment muss
   * zu einem Vorkommen gehoeren, das sie kennt — aus ihrer **eigenen** Liste
   * (per id oder `vonId`) oder aus einer Liste der Vorgabe, deren Vorkommen
   * zuordenbar sind.
   *
   * Der Anlass ist nicht die Auffaecherung, sondern die Vorgabe selbst: eine
   * Profilierung trifft ihre Festlegungen oft **direkt an Vorkommen-Pfaden**
   * (`…/dokument@ams5s52kf35/identifikation/id`). Eine aus XML gewonnene
   * Nachricht liegt in einem anderen id-Raum und kann dort nichts tragen; ohne
   * diesen Filter meldete der Abgleich jede solche Festlegung als „fehlt" — bei
   * einer realen Profilierung 97 Mal, und der Sprung im Bericht landete auf der
   * Wurzel, weil der Baum die Pfade nicht kennt.
   *
   * Uebergangen wird nur, statt zu raten: welches der benannten Vorkommen mit
   * dem einen anonymen der Nachricht gemeint ist, sagt niemand. Der Bericht
   * nennt die Grenze im Kopf.
   *
   * Ohne `zuordenbar` (gefuehrter Durchlauf) traegt jeder Pfad: dort
   * materialisiert der Durchlauf die Vorkommen der Vorgabe unter deren ids.
   */
  imPfadraum(pfad: string, zuordenbar?: (listPfad: string) => boolean): boolean {
    if (!pfad.includes('@')) return true;
    let eigen = '';
    for (const seg of pfad.split('/')) {
      const at = seg.lastIndexOf('@');
      const name = at < 0 ? seg : seg.slice(0, at);
      const listPfad = eigen ? eigen + '/' + name : name;
      if (at < 0) {
        eigen = listPfad;
        continue;
      }
      const id = seg.slice(at + 1);
      const eigeneListe = this.instanz.auspraegungen[listPfad];
      if (eigeneListe) {
        if (!eigeneListe.some((a) => a.id === id || a.vonId === id)) return false;
      } else if (zuordenbar && !zuordenbar(listPfad)) {
        return false;
      }
      eigen = listPfad + '@' + id;
    }
    return true;
  }
}
