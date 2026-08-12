import { Injectable, inject } from '@angular/core';
import { ProfileDoc } from '../../models/profile.model';
import { TreeNode } from '../../models/node.model';
import { blattName, istErweiterungsPfad, ohneVorkommen, vorfahren } from '../util/pfad.util';
import { pretty } from '../util/pretty.util';
import { InstanzModell, VorgabeSicht } from '../vorgabe-sicht';
import { StateService } from './state.service';
import { NavService } from './nav.service';
import { TreeService } from './tree.service';

// Das Instanz-Modell lebt beim Modul der Lesart (vorgabe-sicht.ts);
// bestehende Importer behalten diesen Pfad.
export type { InstanzModell } from '../vorgabe-sicht';

/** Art eines Verstosses — je Art eine eigene Meldung und ein eigener Test. */
export type VerstossArt =
  'ausgeschlossen' | 'kardinalitaet' | 'wert' | 'vorkommen' | 'pflichtwert' | 'fehlt';

/** Ein einzelner Verstoss gegen die gebundene Profilfassung. */
export interface Verstoss {
  /** Baumpfad des betroffenen Knotens (klickbar im Bericht). */
  pfad: string;
  art: VerstossArt;
  /** Nutzertext: was gilt, was die Nachricht tut. */
  text: string;
  /**
   * Der Befund haengt an einem **nachbeauftragten** Element (Schema-Erweiterung,
   * Pfad mit `/~`). Er zaehlt **nicht** gegen die Nachricht: das Element gibt es
   * im Schema nicht, eine gueltige XJustiz-Nachricht kann es nicht enthalten.
   * Ohne diese Unterscheidung meldete der Abgleich jede nachbeauftragte
   * Pflicht-Festlegung als "fehlt" und lastete dem Absender etwas an, das nur
   * die Profilierung wuenscht (#98, Frage 8 der Spec zu #107).
   */
  erweiterung?: boolean;
}

/**
 * Ein belegtes Element, ueber das die Profilierung **nie entschieden** hat.
 * Der Anspruch ist eine vollstaendige Profilierung: zu jedem Element eine
 * Aussage. Wo sie fehlt, liegt der Mangel bei der **Profilierung**, nicht bei
 * der Nachricht — darum ein eigener Typ neben `Verstoss` und keine weitere
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
  /** Wie weit der Abgleich ueberhaupt reichte (siehe `Reichweite`). */
  reichweite: Reichweite;
}

/**
 * Die **Reichweite** eines Abgleichs: wie viele durchsetzbare Festlegungen der
 * Vorgabe angewandt werden konnten. Ohne diese Zahl liest sich „keine
 * Abweichungen" als Unbedenklichkeitsbescheinigung, auch wenn der Abgleich
 * kaum etwas anwenden konnte.
 */
export interface Reichweite {
  /** Durchsetzbare Festlegungen der geprueften Fassung. */
  gesamt: number;
  /** Davon nicht zuordenbar und darum ungeprueft (benannte Vorkommen). */
  ungeprueft: number;
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
    this.pruefeZwingende(v, instanz, out, umgebung);
    return {
      // Die Herkunft an genau einer Stelle angeheftet, statt in jeder einzelnen
      // Pruefung: sie haengt allein am Pfad, und jede Art kann sie treffen.
      verstoesse: out
        .map((x) => (istErweiterungsPfad(x.pfad) ? { ...x, erweiterung: true } : x))
        .sort((a, b) => a.pfad.localeCompare(b.pfad)),
      luecken: this.sammleLuecken(v, instanz),
      reichweite: this.reichweite(v, umgebung),
    };
  }

  /**
   * Wie viele Festlegungen der Vorgabe **konnten** ueberhaupt angewandt werden?
   *
   * Profilierungen treffen ihre Festlegungen ueberwiegend je **benanntem
   * Vorkommen** (an realen Profilierungen 48 bis 92 Prozent). Eine aus XML
   * gewonnene Nachricht traegt dort anonyme Vorkommen; solche Festlegungen sind
   * nicht zuordenbar und bleiben ungeprueft (`imPfadraum`). Ohne diese Zahl
   * liest sich „keine Abweichungen" als „die Nachricht ist in Ordnung", obwohl
   * womoeglich neun von zehn Festlegungen nie zur Anwendung kamen — genau die
   * Sorte falsch-gruenes Urteil, das dieser Bericht vermeiden soll.
   *
   * Gezaehlt werden nur die **durchsetzbaren** Aussagen (Status, Werteliste,
   * Kardinalitaet): Anmerkung und Beispielwert legen nichts fest, sie koennen
   * darum auch nicht ungeprueft bleiben.
   */
  private reichweite(v: VorgabeSicht, umgebung: KonformitaetsUmgebung): Reichweite {
    let gesamt = 0;
    let ungeprueft = 0;
    for (const [pfad, e] of Object.entries(v.doc.elemente)) {
      if (!e.status && !e.werte?.length && !e.min && !e.max) continue;
      gesamt++;
      if (!v.imPfadraum(pfad, umgebung.vorkommenZuordenbar)) ungeprueft++;
    }
    return { gesamt, ungeprueft };
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
   *
   * Gefragt wird ueber die **generische Form** des Pfads, also
   * vorkommen-unabhaengig. Der Grund ist gemeldet worden: Profilierungen
   * treffen ihre Festlegungen oft je **benanntem Vorkommen**
   * (`…/beteiligung@amsd619e91/…/anschriftstyp` = pflicht, Werte ['003'] fuer
   * die Notarin). Eine aus XML gewonnene Nachricht traegt dort ein anonymes
   * Vorkommen; pfadgenau und generisch gesucht findet sich nichts, und der
   * Bericht behauptete „die Profilierung trifft zu diesem Element keine
   * Festlegung" — obwohl sie eine trifft, die sich nur nicht **zuordnen**
   * laesst. Das ist der Unterschied zwischen „nichts entschieden" und „nicht
   * attribuierbar", und nur das Erste ist eine Luecke.
   *
   * Die Lesart ist damit bewusst grosszuegig: gibt es die Aussage unter
   * irgendeinem Vorkommen, gilt das Element als bedacht. Lieber eine Luecke
   * uebersehen als eine behaupten, die es nicht gibt — der Kopf des Berichts
   * sagt ohnehin, dass die Vorkommen nicht zuordenbar sind.
   */
  private sammleLuecken(v: VorgabeSicht, instanz: InstanzModell): Luecke[] {
    // Alle Elemente, zu denen die Vorgabe **irgendwo** eine durchsetzbare
    // Aussage trifft — auf die vorkommen-unabhaengige Form gebracht.
    const bedacht = new Set<string>();
    for (const [pfad, e] of Object.entries(v.doc.elemente)) {
      if (e.status || e.werte?.length || e.min || e.max) bedacht.add(ohneVorkommen(pfad));
    }
    const out: Luecke[] = [];
    for (const [pfad, p] of Object.entries(instanz.elemente)) {
      const wert = p.beispiel?.trim();
      if (!wert) continue;
      if (bedacht.has(ohneVorkommen(pfad))) continue;
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
    // Instanz-Listen im Pfadraum der **Vorgabe**: innere Listen einer aus XML
    // gewonnenen Nachricht liegen unter deren frischen ids
    // (`m/bet@v1/anschrift`), die Vorgabe fuehrt sie unter ihren eigenen
    // (`m/bet@a1/anschrift`). Ueber den Quellpfad (vonId) faellt beides
    // zusammen — ohne die Uebersetzung blieben zwingende Vorkommen innerer
    // Listen dort ungeprueft, wo die Zuordnung (Namen oder Kennzeichen, #116)
    // sie gerade nachweisbar gemacht hat.
    const uebersetzt = new Map<string, string>();
    for (const pfad of Object.keys(instanz.auspraegungen)) uebersetzt.set(v.quellPfad(pfad), pfad);
    for (const [listPfad, liste] of Object.entries(v.doc.auspraegungen)) {
      const eigenPfad = instanz.auspraegungen[listPfad] ? listPfad : uebersetzt.get(listPfad);
      const eigene = eigenPfad ? instanz.auspraegungen[eigenPfad] : undefined;
      if (!eigenPfad || !eigene) continue; // keine eigene Liste = die der Vorgabe gilt unveraendert
      // Ohne Zuordenbarkeit sagt der Vergleich nichts (siehe Umgebung): die
      // Anzahl prueft `pruefeKardinalitaet` weiterhin.
      if (umgebung.vorkommenZuordenbar && !umgebung.vorkommenZuordenbar(eigenPfad)) continue;
      for (const a of liste) {
        // **Pfadgenau**, nicht geerbt — dieselbe Entscheidung wie
        // `GuidedService.auspSperreEntfernen` (#28): dass das Traegerelement
        // zwingend ist, sagt nur, dass es vorkommen muss, nicht dass jedes
        // benannte Vorkommen bleiben muss. Geerbt gelesen meldete der Abgleich
        // ein Entfernen als Verstoss, das der Durchlauf ausdruecklich erlaubt
        // (Deep-Review-Befund: Widerspruch Sperre vs. Verstossliste).
        if (v.wirkung(`${eigenPfad}@${a.id}`) !== 'pflicht') continue;
        // Eine Kopie traegt die Herkunft und erfuellt die Festlegung mit.
        if (eigene.some((e) => e.id === a.id || e.vonId === a.id)) continue;
        // Der gemeldete Pfad ist der der **Nachricht** — auf ihn zeigt der
        // Klick im Bericht, und nur ihn rendert der Baum.
        out.push({
          pfad: eigenPfad,
          art: 'vorkommen',
          text: `${kurz(eigenPfad)} (${eigenPfad}): Das zwingende Vorkommen „${a.name}" fehlt in der Nachricht.`,
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
      for (const ziel of v.instanzPfade(pfad, umgebung.vorkommenZuordenbar)) ziele.add(ziel);
    }
    for (const ziel of ziele) {
      // Auch am Ziel: in einem ausgeschlossenen Vorkommen materialisiert der
      // Durchlauf nichts — dort zu zaehlen meldete Verstoesse in gesperrten
      // Teilbaeumen (Deep-Review-Befund).
      if (v.ausschlussQuelle(ziel)) continue;
      // Pfade im id-Raum der Vorgabe, die die Nachricht nicht tragen kann,
      // sind unbeantwortbar — nicht "null Vorkommen" (siehe `imPfadraum`).
      if (!v.imPfadraum(ziel, umgebung.vorkommenZuordenbar)) continue;
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
   * Zwingend gesetzte Elemente: **fehlen** sie ganz, oder traegt ein zwingendes
   * **Blatt** keinen Wert? Zwei Befunde am selben Anlass, jeder mit eigener
   * Voraussetzung aus der Umgebung:
   *
   * - `fehlt` braucht `istEnthalten`. Es gilt fuer Blaetter **und** Container:
   *   ein zwingender Container ohne Wert ist voellig in Ordnung — einer, den
   *   die Nachricht gar nicht enthaelt, nicht. Vor der einen Enthaltensein-
   *   Regel (ADR 0018) liess sich das nicht unterscheiden, und der haeufigste
   *   reale Verstoss — „der Pflichtblock fehlt komplett" — blieb stumm.
   * - `pflichtwert` braucht `istBlatt`: ob ein Pfad einen eigenen Wert traegt,
   *   steht im Schema, nicht in den beiden Dokumenten.
   *
   * Fehlt die jeweilige Auskunft, entfaellt der zugehoerige Befund, statt zu
   * raten.
   */
  private pruefeZwingende(
    v: VorgabeSicht,
    instanz: InstanzModell,
    out: Verstoss[],
    umgebung: KonformitaetsUmgebung,
  ): void {
    const { istBlatt, istEnthalten } = umgebung;
    if (!istBlatt && !istEnthalten) return;
    for (const [pfad, p] of Object.entries(v.doc.elemente)) {
      if (!p.status || v.wirkungGeerbt(pfad) !== 'pflicht') continue;
      if (v.ausschlussQuelle(pfad)) continue;
      // Ein zwingendes Element in einem Vorkommen-Pfadraum wird ueber die
      // Vorkommen der Nachricht geprueft, nicht am generischen Pfad.
      for (const ziel of v.instanzPfade(pfad, umgebung.vorkommenZuordenbar)) {
        if (v.ausschlussQuelle(ziel)) continue; // gesperrtes Vorkommen: nichts verlangt
        if (!v.imPfadraum(ziel, umgebung.vorkommenZuordenbar)) continue;
        // **Elternabhaengigkeit** (ADR 0016): was die Nachricht nicht betritt,
        // verlangt sie auch nicht — auch dann nicht, wenn die gebundene Fassung
        // darunter etwas zwingend setzt. Der fehlende Vorfahr ist der Befund,
        // nicht sein Inhalt.
        //
        // Ohne diese Regel meldete der Abgleich jeden zwingend gesetzten Zweig
        // einer **Auswahl** als fehlend: in einer Auswahl kann nur einer
        // vorkommen, die uebrigen fehlen notwendig. An einer realen
        // Profilierung waren das zwoelf Befunde, alle unschuldig. Dass die
        // Profilierung mehrere sich ausschliessende Zweige verlangt, ist ein
        // Widerspruch **in ihr** (ADR 0015) — kein Mangel der Nachricht.
        if (vorfahren(ziel).some((a) => istEnthalten?.(a) === false)) continue;
        // Wo die Profilierung zusaetzlich eine Mindestanzahl fuehrt, meldet die
        // Kardinalitaets-Pruefung denselben Sachverhalt mit der genaueren Zahl.
        const auskunft = v.eintragGeerbt(ziel)?.min ? null : istEnthalten?.(ziel);
        if (auskunft === false) {
          out.push({
            pfad: ziel,
            art: 'fehlt',
            text: `${kurz(ziel)} (${ziel}): Die Profilierung setzt das Element zwingend, die Nachricht enthält es nicht.`,
          });
          continue; // fehlt ganz — die Frage nach dem Wert stellt sich nicht
        }
        if (!istBlatt?.(ziel)) continue;
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
