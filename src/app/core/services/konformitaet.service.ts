import { Injectable, inject } from '@angular/core';
import { ProfileDoc } from '../../models/profile.model';
import { TreeNode } from '../../models/node.model';
import { blattName, ohneVorkommen } from '../util/pfad.util';
import { pretty } from '../util/pretty.util';
import { InstanzModell, VorgabeSicht } from '../vorgabe-sicht';
import { StateService } from './state.service';
import { NavService } from './nav.service';
import { TreeService } from './tree.service';

// Das Instanz-Modell lebt beim Modul der Lesart (vorgabe-sicht.ts);
// bestehende Importer behalten diesen Pfad.
export type { InstanzModell } from '../vorgabe-sicht';

/** Art eines Verstosses — je Art eine eigene Meldung und ein eigener Test. */
export type VerstossArt = 'ausgeschlossen' | 'kardinalitaet' | 'wert' | 'vorkommen' | 'pflichtwert';

/** Ein einzelner Verstoss gegen die gebundene Profilfassung. */
export interface Verstoss {
  /** Baumpfad des betroffenen Knotens (klickbar im Bericht). */
  pfad: string;
  art: VerstossArt;
  /** Nutzertext: was gilt, was die Nachricht tut. */
  text: string;
}

/**
 * Ein belegtes Element, ueber das die Profilierung **nie entschieden** hat.
 * Der Anspruch ist eine vollstaendige Profilierung: zu jedem Element eine
 * Aussage. Wo sie fehlt, liegt der Mangel bei der **Profilierung**, nicht bei
 * der Nachricht — darum eine eigene Art von Befund und keine sechste
 * Verstossart. Wer beides in eine Liste wirft, schiebt dem Absender die eigene
 * Unvollstaendigkeit zu.
 */
export interface Luecke {
  pfad: string;
  /** Der belegte Wert — er macht die Luecke im Bericht greifbar. */
  wert: string;
  text: string;
}

/**
 * Beide Befunde eines Abgleichs, getrennt gehalten. Der Speicher-Weg liest
 * ausschliesslich `verstoesse`: eine unvollstaendige Profilierung darf keine
 * gefuehrt erstellte Nachricht zum Entwurf machen (`speicherUrteil`).
 */
export interface Pruefbefunde {
  verstoesse: Verstoss[];
  luecken: Luecke[];
}

/**
 * Umgebungswissen, das nicht in den beiden Dokumenten steht. Bewusst als reine
 * Funktionen hereingereicht, damit der Abgleich **zustandslos** bleibt und ohne
 * laufende Sitzung aufrufbar ist (Spec #31): der Aufrufer im Werkzeug reicht
 * den Baum durch, ein Test reicht eine Tabelle.
 */
export interface KonformitaetsUmgebung {
  /** Ist der Pfad im Schema ein Blatt (traegt also selbst einen Wert)? */
  istBlatt?: (pfad: string) => boolean;
  /**
   * Traegt die Nachricht diesen Pfad? Beantwortet ueber die eine Regel
   * (`core/enthalten.ts`) von der Schicht, die Schema und Profil kennt —
   * dieselbe, aus der der Export entscheidet, was er schreibt. `null` heisst
   * "keine Auskunft" (etwa: der Baum kennt den Pfad nicht); dann gilt der
   * Rueckfall der Zaehlkonvention in `VorgabeSicht.vorkommenAnzahl`.
   *
   * Ohne diese Funktion zaehlt der Abgleich ein Element als vorhanden, das der
   * Export nicht schreibt — die Kardinalitaets-Pruefung ist dann schwaecher,
   * aber nicht falsch begruendet.
   */
  istEnthalten?: (pfad: string) => boolean | null;
  /**
   * Lassen sich die benannten Vorkommen dieser Liste ueberhaupt zuordnen?
   *
   * Ein XJustiz-XML kann keine Vorkommen-Namen tragen (siehe
   * `AuspBezeichnungen` im Testnachrichten-Modell) — eine aus XML gewonnene
   * Liste traegt frische ids ohne Herkunft, und dann trifft **keine** id der
   * Vorgabe zu. Ohne diese Frage meldete der Abgleich jedes zwingende benannte
   * Vorkommen als fehlend, bei jeder hochgeladenen Nachricht, garantiert
   * falsch-positiv.
   *
   * Fehlt die Funktion, wird geprueft (der gefuehrte Durchlauf fuehrt die ids
   * selbst und ist damit immer zuordenbar).
   */
  vorkommenZuordenbar?: (listPfad: string) => boolean;
}

/**
 * Abgleich einer Testnachricht gegen die eingefrorene Profilkopie —
 * „profilkonform" wird geprueft, nicht behauptet (Spec #31).
 *
 * Die Ausschluss-Skips (`ausschlussQuelle`) lesen die Wirkung **feldweise
 * geerbt** — wie die Sperre des Stores. Das ist seit der gemeinsamen
 * VorgabeSicht eine bewusste Verhaltensaenderung gegenueber der alten,
 * eintragsweisen Lesart: ein pfadgenauer Eintrag ohne Status verdeckt den
 * generischen Ausschluss nicht mehr, entsprechend mehr Pfade werden von den
 * Kardinalitaets-/Pflichtwert-Pruefungen uebersprungen.
 *
 * **Zustandslos:** der Dienst liest weder Store noch Sitzung; er bekommt die
 * gebundene Fassung und das Instanz-Modell uebergeben. Damit laeuft er auch
 * ueber einen gespeicherten Eintrag, dessen Sitzung laengst beendet ist — und
 * genau das ist der Zweck: eine Nachricht kann spaeter bearbeitet oder gegen
 * eine geaenderte Fassung fortgesetzt werden, das blosse Erzwingen im
 * Durchlauf traegt dann nicht mehr.
 *
 * Gelesen wird die Vorgabe ueber die **eine** Lesart (`VorgabeSicht`) — genau
 * dieselbe, mit der der Store Sperren und effektive Kardinalitaet ableitet.
 * Vor der Extraktion hielt dieser Service eine eigene Kopie der Regeln, die
 * bereits divergierte (Kardinalitaet roh statt geerbt, Wirkung eintragsweise
 * statt feldweise): eine generisch eingegrenzte Mindestanzahl innerhalb eines
 * Vorkommens machte eine konforme Nachricht zum Entwurf.
 */
@Injectable({ providedIn: 'root' })
export class KonformitaetService {
  pruefe(
    vorgabe: ProfileDoc,
    instanz: InstanzModell,
    umgebung: KonformitaetsUmgebung = {},
  ): Pruefbefunde {
    const v = new VorgabeSicht(vorgabe, instanz);
    const out: Verstoss[] = [];
    this.pruefeAusgeschlossen(v, instanz, out);
    this.pruefeWerte(v, instanz, out);
    this.pruefeVorkommen(v, instanz, out, umgebung);
    this.pruefeKardinalitaet(v, out, umgebung);
    this.pruefePflichtwerte(v, instanz, out, umgebung);
    return {
      verstoesse: out.sort((a, b) => a.pfad.localeCompare(b.pfad)),
      luecken: this.sammleLuecken(v, instanz),
    };
  }

  /**
   * Belegte Elemente, zu denen die Profilierung **keine durchsetzbare Aussage**
   * trifft: keine Statusstufe (feldweise geerbt) und auch keine der Grenzen, die
   * dieser Abgleich prueft — Werteliste, Mindest- oder Hoechstanzahl.
   *
   * Warum nicht allein „keine Statusstufe": eine Werteliste ohne Stufe ist eine
   * Aussage, und der Wert-Test setzt sie durch. Ein Element deswegen zugleich
   * als Verstoss **und** als Luecke zu melden, waere widerspruechlich — der
   * Bericht saegte, die Profilierung habe nichts gesagt, und im selben Atemzug,
   * die Nachricht halte sich nicht daran. Anmerkung und Beispielwert zaehlen
   * dagegen **nicht** als Aussage: sie erlaeutern und schlagen vor, sie legen
   * nichts fest.
   *
   * Erhoben werden die Pfade, die das Modell mit Wert fuehrt — die belegten
   * Blaetter. Ein Container traegt im Modell nichts und erscheint daher nicht;
   * das ist keine Auslassung, sondern die Grenze dessen, was eine Instanz ueber
   * sich sagt.
   *
   * Was ein Vorfahr ausschliesst, ist bereits ein **Verstoss** und wird hier
   * nicht noch einmal gemeldet: dort hat die Profilierung entschieden, die
   * Nachricht haelt sich nur nicht daran.
   */
  private sammleLuecken(v: VorgabeSicht, instanz: InstanzModell): Luecke[] {
    const out: Luecke[] = [];
    for (const [pfad, p] of Object.entries(instanz.elemente)) {
      const wert = p.beispiel?.trim();
      if (!wert) continue;
      if (v.wirkungGeerbt(pfad)) continue;
      const eintrag = v.eintragGeerbt(pfad);
      if (eintrag?.werte?.length || eintrag?.min || eintrag?.max) continue;
      if (v.ausschlussQuelle(pfad)) continue;
      out.push({
        pfad,
        wert,
        text: `${kurz(pfad)} (${pfad}): belegt mit „${wert}" — die Profilierung trifft zu diesem Element keine Festlegung.`,
      });
    }
    return out.sort((a, b) => a.pfad.localeCompare(b.pfad));
  }

  /** Belegte Pfade, die die Profilierung ausschliesst (auch geerbt vom Vorfahren). */
  private pruefeAusgeschlossen(v: VorgabeSicht, instanz: InstanzModell, out: Verstoss[]): void {
    for (const [pfad, p] of Object.entries(instanz.elemente)) {
      if (!p.beispiel?.trim()) continue;
      const quelle = v.ausschlussQuelle(pfad);
      if (!quelle) continue;
      // Selbst-Ausschluss auch dann, wenn die Festlegung am generischen
      // Zwilling oder an der vonId-Quelle steht: das ist derselbe Sachverhalt
      // am selben Element, kein Vorfahren-Ausschluss — die "samt
      // Teilbaum"-Variante nannte sonst einen Pfad, den der Baum wegen #28
      // nicht rendert (Deep-Review-Befund).
      const selbst =
        quelle === pfad || quelle === ohneVorkommen(pfad) || quelle === v.quellPfad(pfad);
      out.push({
        pfad,
        art: 'ausgeschlossen',
        text: selbst
          ? `${kurz(pfad)} (${pfad}): Die Profilierung schließt das Element aus, die Nachricht trägt hier einen Wert.`
          : `${kurz(pfad)} (${pfad}): Die Profilierung schließt ${kurz(quelle)} (${quelle}) samt Teilbaum aus, die Nachricht trägt hier einen Wert.`,
      });
    }
  }

  /** Werte ausserhalb der freigegebenen Codelisten-Auswahl. */
  private pruefeWerte(v: VorgabeSicht, instanz: InstanzModell, out: Verstoss[]): void {
    for (const [pfad, p] of Object.entries(instanz.elemente)) {
      const wert = p.beispiel?.trim();
      if (!wert) continue;
      const werte = v.eintragGeerbt(pfad)?.werte;
      if (!werte?.length) continue; // keine Einschraenkung bzw. „keine" — anderer Befund
      if (werte.includes(wert)) continue;
      out.push({
        pfad,
        art: 'wert',
        text: `${kurz(pfad)} (${pfad}): „${wert}" ist nicht freigegeben — zugelassen sind ${werte.map((w) => `„${w}"`).join(', ')}.`,
      });
    }
  }

  /** Zwingend gesetzte Vorkommen, die in der Nachricht fehlen. */
  private pruefeVorkommen(
    v: VorgabeSicht,
    instanz: InstanzModell,
    out: Verstoss[],
    umgebung: KonformitaetsUmgebung,
  ): void {
    for (const [listPfad, liste] of Object.entries(v.doc.auspraegungen)) {
      const eigene = instanz.auspraegungen[listPfad];
      if (!eigene) continue; // keine eigene Liste = die der Vorgabe gilt unveraendert
      // Ohne Zuordenbarkeit sagt der Vergleich nichts (siehe Umgebung): die
      // Anzahl prueft `pruefeKardinalitaet` weiterhin.
      if (umgebung.vorkommenZuordenbar && !umgebung.vorkommenZuordenbar(listPfad)) continue;
      for (const a of liste) {
        // **Pfadgenau**, nicht geerbt — dieselbe Entscheidung wie
        // `GuidedService.auspSperreEntfernen` (#28): dass das Traegerelement
        // zwingend ist, sagt nur, dass es vorkommen muss, nicht dass jedes
        // benannte Vorkommen bleiben muss. Geerbt gelesen meldete der Abgleich
        // ein Entfernen als Verstoss, das der Durchlauf ausdruecklich erlaubt
        // (Deep-Review-Befund: Widerspruch Sperre vs. Verstossliste).
        if (v.wirkung(`${listPfad}@${a.id}`) !== 'pflicht') continue;
        // Eine Kopie traegt die Herkunft und erfuellt die Festlegung mit.
        if (eigene.some((e) => e.id === a.id || e.vonId === a.id)) continue;
        out.push({
          pfad: listPfad,
          art: 'vorkommen',
          text: `${kurz(listPfad)} (${listPfad}): Das zwingende Vorkommen „${a.name}" fehlt in der Nachricht.`,
        });
      }
    }
  }

  /** Verletzte Kardinalitaeten der Profilierung (Mindest- und Hoechstanzahl). */
  private pruefeKardinalitaet(
    v: VorgabeSicht,
    out: Verstoss[],
    umgebung: KonformitaetsUmgebung,
  ): void {
    // Erst die Ziele einsammeln, dedupliziert: mehrere Vorgabe-Eintraege
    // (generisch und pfadgenau) koennen auf dasselbe Instanz-Ziel zeigen.
    // Massgeblich ist dort die **effektive** Grenze der Lesart (pfadgenau vor
    // generisch, `eintragGeerbt`) — je Eintrag einzeln geprueft projizierte
    // die generische Grenze auch auf Vorkommen mit eigener pfadgenauer Grenze
    // und meldete doppelt (Deep-Review-Befund). Je **Instanz-Pfad** gezaehlt
    // wird weiterhin: die materialisierten Vorkommen liegen an den @-Pfaden
    // (#28), nicht am generischen.
    const ziele = new Set<string>();
    for (const [pfad, p] of Object.entries(v.doc.elemente)) {
      if (!p.min && !p.max) continue;
      // Ausgeschlossenes zaehlt nicht: der Widerspruch „ausgeschlossen und
      // zugleich verlangt" ist ein Mangel der Profilierung, nicht der
      // Nachricht (er wird beim Start des Durchlaufs gemeldet).
      if (v.ausschlussQuelle(pfad)) continue;
      for (const ziel of v.instanzPfade(pfad)) ziele.add(ziel);
    }
    for (const ziel of ziele) {
      // Auch am Ziel: in einem ausgeschlossenen Vorkommen materialisiert der
      // Durchlauf nichts — dort zu zaehlen meldete Verstoesse in gesperrten
      // Teilbaeumen (Deep-Review-Befund).
      if (v.ausschlussQuelle(ziel)) continue;
      const g = v.eintragGeerbt(ziel);
      const min = parseInt(g?.min ?? '', 10) || 0;
      const max = g?.max === 'unbounded' ? Infinity : parseInt(g?.max ?? '', 10) || Infinity;
      if (!min && max === Infinity) continue;
      const n = v.vorkommenAnzahl(ziel, umgebung.istEnthalten);
      if (min && n < min) {
        out.push({
          pfad: ziel,
          art: 'kardinalitaet',
          text: `${kurz(ziel)} (${ziel}): Die Profilierung verlangt mindestens ${min} Vorkommen, die Nachricht trägt ${n}.`,
        });
      }
      if (n > max) {
        out.push({
          pfad: ziel,
          art: 'kardinalitaet',
          text: `${kurz(ziel)} (${ziel}): Die Profilierung lässt höchstens ${max} Vorkommen zu, die Nachricht trägt ${n}.`,
        });
      }
    }
  }

  /**
   * Zwingend gesetzte **Blaetter** ohne Wert. Nur mit Blatt-Wissen aus der
   * Umgebung: ob ein Pfad einen eigenen Wert traegt, steht im Schema, nicht in
   * den beiden Dokumenten. Ohne `istBlatt` entfaellt die Pruefung, statt zu
   * raten (ein zwingender Container ohne Wert ist voellig in Ordnung).
   */
  private pruefePflichtwerte(
    v: VorgabeSicht,
    instanz: InstanzModell,
    out: Verstoss[],
    umgebung: KonformitaetsUmgebung,
  ): void {
    const istBlatt = umgebung.istBlatt;
    if (!istBlatt) return;
    for (const [pfad, p] of Object.entries(v.doc.elemente)) {
      if (!p.status || v.wirkungGeerbt(pfad) !== 'pflicht') continue;
      if (v.ausschlussQuelle(pfad)) continue;
      // Ein zwingendes Element in einem Vorkommen-Pfadraum wird ueber die
      // Vorkommen der Nachricht geprueft, nicht am generischen Pfad.
      for (const ziel of v.instanzPfade(pfad)) {
        if (v.ausschlussQuelle(ziel)) continue; // gesperrtes Vorkommen: nichts verlangt
        if (!istBlatt(ziel)) continue;
        if (instanz.elemente[ziel]?.beispiel?.trim()) continue;
        out.push({
          pfad: ziel,
          art: 'pflichtwert',
          text: `${kurz(ziel)} (${ziel}): Die Profilierung setzt das Element zwingend, die Nachricht trägt keinen Wert.`,
        });
      }
    }
  }
}

/**
 * Duenne Anbindung des zustandslosen Abgleichs an die **laufende Sitzung** —
 * der Adapter, den beide Speicherwege teilen (gefuehrtes Erstellen und
 * Bearbeiten, #31/#32). Er holt gebundene Fassung und Instanz-Modell aus dem
 * Store und reicht das Blatt-Wissen aus dem Baum hinein; die Regeln selbst
 * bleiben im `KonformitaetService`, damit sie ohne Sitzung pruefbar sind.
 */
@Injectable({ providedIn: 'root' })
export class SitzungsAbgleichService {
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly tree = inject(TreeService);
  private readonly konformitaet = inject(KonformitaetService);

  /**
   * Verstoesse der aktuellen Sitzung — leer ohne gebundene Fassung.
   *
   * Bewusst **nur** die Verstoesse: die Luecken der Profilierung gehen den
   * Speicher-Weg nichts an. Wuerde er sie mitlesen, machte eine noch
   * unvollstaendige Profilierung jede gefuehrt erstellte Nachricht zum Entwurf
   * (`speicherUrteil`) — ein Mangel der Vorgabe, der der Nachricht angelastet
   * wuerde.
   */
  pruefe(): Verstoss[] {
    const vorgabe = this.state.vorgabe();
    if (!vorgabe) return [];
    return this.konformitaet.pruefe(
      vorgabe,
      { elemente: this.state.elemente(), auspraegungen: this.state.auspraegungen() },
      {
        istBlatt: (pfad) => {
          const node = this.knoten(pfad);
          return node ? this.tree.isLeaf(node) : false;
        },
        // Ueber die eine Regel, also mit derselben Antwort, die der Export
        // beim Schreiben gibt. Was der Baum nicht kennt, bleibt ohne Auskunft
        // (`null`) — dieselbe Entscheidung wie bei den Sperren des Durchlaufs
        // (`GuidedService.kardLage`, Issue #49): ein Pfad aus einer alten
        // Fassung ist ein Mangel der Profilierung, kein Befund an der
        // Nachricht, und soll hier keinen Verstoss erfinden.
        istEnthalten: (pfad) => {
          const node = this.knoten(pfad);
          return node ? this.state.enthaelt(node) : null;
        },
      },
    ).verstoesse;
  }

  /** Der Baumknoten zu einem Pfad — null, wo der Baum ihn nicht kennt. */
  private knoten(pfad: string): TreeNode | null {
    const it = this.nav.findItemByPath(pfad);
    if (!it) return null;
    return it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
  }
}

/** Letztes Pfadsegment als Anzeigename. */
function kurz(pfad: string): string {
  return pretty(blattName(pfad));
}
