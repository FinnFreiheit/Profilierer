import { Injectable } from '@angular/core';
import { Auspraegung, ElementProfile, ProfileDoc, Wirkung } from '../../models/profile.model';
import { ohneVorkommen } from '../../models/node.model';
import { pretty } from '../util/pretty.util';

/** Das Instanz-Modell, gegen das geprueft wird — die Entscheidungsschicht. */
export interface InstanzModell {
  elemente: Record<string, ElementProfile>;
  auspraegungen: Record<string, Auspraegung[]>;
}

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
 * Umgebungswissen, das nicht in den beiden Dokumenten steht. Bewusst als reine
 * Funktionen hereingereicht, damit der Abgleich **zustandslos** bleibt und ohne
 * laufende Sitzung aufrufbar ist (Spec #31): der Aufrufer im Werkzeug reicht
 * den Baum durch, ein Test reicht eine Tabelle.
 */
export interface KonformitaetsUmgebung {
  /** Ist der Pfad im Schema ein Blatt (traegt also selbst einen Wert)? */
  istBlatt?: (pfad: string) => boolean;
}

/**
 * Abgleich einer Testnachricht gegen die eingefrorene Profilkopie —
 * „profilkonform" wird geprueft, nicht behauptet (Spec #31).
 *
 * **Zustandslos:** der Dienst liest weder Store noch Sitzung; er bekommt die
 * gebundene Fassung und das Instanz-Modell uebergeben. Damit laeuft er auch
 * ueber einen gespeicherten Eintrag, dessen Sitzung laengst beendet ist — und
 * genau das ist der Zweck: eine Nachricht kann spaeter bearbeitet oder gegen
 * eine geaenderte Fassung fortgesetzt werden, das blosse Erzwingen im
 * Durchlauf traegt dann nicht mehr.
 *
 * Gelesen wird die Vorgabe mit derselben Aufloesung wie im Store: pfadgenau,
 * sonst generisch (`ohneVorkommen`) — was generisch festgelegt ist, gilt in
 * jedem Vorkommen (#59) — und ueber die Herkunft einer Kopie (`vonId`, #28).
 */
@Injectable({ providedIn: 'root' })
export class KonformitaetService {
  pruefe(
    vorgabe: ProfileDoc,
    instanz: InstanzModell,
    umgebung: KonformitaetsUmgebung = {},
  ): Verstoss[] {
    const v = new VorgabeSicht(vorgabe, instanz);
    const out: Verstoss[] = [];
    this.pruefeAusgeschlossen(v, instanz, out);
    this.pruefeWerte(v, instanz, out);
    this.pruefeVorkommen(v, instanz, out);
    this.pruefeKardinalitaet(v, instanz, out);
    this.pruefePflichtwerte(v, instanz, out, umgebung);
    return out.sort((a, b) => a.pfad.localeCompare(b.pfad));
  }

  /** Belegte Pfade, die die Profilierung ausschliesst (auch geerbt vom Vorfahren). */
  private pruefeAusgeschlossen(v: VorgabeSicht, instanz: InstanzModell, out: Verstoss[]): void {
    for (const [pfad, p] of Object.entries(instanz.elemente)) {
      if (!p.beispiel?.trim()) continue;
      const quelle = v.ausschlussQuelle(pfad);
      if (!quelle) continue;
      out.push({
        pfad,
        art: 'ausgeschlossen',
        text:
          quelle === pfad
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
      const werte = v.profil(pfad)?.werte;
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
  private pruefeVorkommen(v: VorgabeSicht, instanz: InstanzModell, out: Verstoss[]): void {
    for (const [listPfad, liste] of Object.entries(v.doc.auspraegungen)) {
      const eigene = instanz.auspraegungen[listPfad];
      if (!eigene) continue; // keine eigene Liste = die der Vorgabe gilt unveraendert
      for (const a of liste) {
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
  private pruefeKardinalitaet(v: VorgabeSicht, instanz: InstanzModell, out: Verstoss[]): void {
    for (const [pfad, p] of Object.entries(v.doc.elemente)) {
      if (!p.min && !p.max) continue;
      // Ausgeschlossenes zaehlt nicht: der Widerspruch „ausgeschlossen und
      // zugleich verlangt" ist ein Mangel der Profilierung, nicht der Nachricht
      // (er wird beim Start des Durchlaufs gemeldet).
      if (v.ausschlussQuelle(pfad)) continue;
      const min = parseInt(p.min ?? '', 10) || 0;
      const max = p.max === 'unbounded' ? Infinity : parseInt(p.max ?? '', 10) || Infinity;
      const n = v.vorkommenAnzahl(pfad, instanz);
      if (min && n < min) {
        out.push({
          pfad,
          art: 'kardinalitaet',
          text: `${kurz(pfad)} (${pfad}): Die Profilierung verlangt mindestens ${min} Vorkommen, die Nachricht trägt ${n}.`,
        });
      }
      if (n > max) {
        out.push({
          pfad,
          art: 'kardinalitaet',
          text: `${kurz(pfad)} (${pfad}): Die Profilierung lässt höchstens ${max} Vorkommen zu, die Nachricht trägt ${n}.`,
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
      if (!p.status || v.wirkung(pfad) !== 'pflicht') continue;
      if (v.ausschlussQuelle(pfad)) continue;
      // Ein zwingendes Element in einem Vorkommen-Pfadraum wird ueber die
      // Vorkommen der Nachricht geprueft, nicht am generischen Pfad.
      for (const ziel of v.instanzPfade(pfad, instanz)) {
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

/** Letztes Pfadsegment als Anzeigename. */
function kurz(pfad: string): string {
  return pretty(pfad.split('/').at(-1)!.split('@')[0]!.split('#')[0]!);
}

/**
 * Lesesicht auf die gebundene Fassung — dieselben Regeln wie im Store, aber
 * ohne Store: pfadgenau vor generisch, Kopien ueber ihre Herkunft.
 */
class VorgabeSicht {
  constructor(
    readonly doc: ProfileDoc,
    private readonly instanz: InstanzModell,
  ) {}

  /** Der Eintrag der Vorgabe zu einem Instanz-Pfad. */
  profil(pfad: string): ElementProfile | null {
    return (
      this.doc.elemente[pfad] ??
      this.doc.elemente[this.quellPfad(pfad)] ??
      this.doc.elemente[ohneVorkommen(pfad)] ??
      null
    );
  }

  /** Die Wirkung der Vorgabe an einem Pfad (ueber ihre eigene Stufenliste). */
  wirkung(pfad: string): Wirkung | null {
    const id = this.profil(pfad)?.status;
    return (id && this.doc.statuses.find((s) => s.id === id)?.wirkung) || null;
  }

  /**
   * Der Pfad des Ausschlusses, der diesen Pfad trifft — er selbst oder der
   * naechstgelegene Vorfahr; null, wenn nichts ausschliesst. Vorfahren zaehlen
   * an '/' **und** '@', der Ausschluss vererbt sich also ueber Vorkommen-Grenzen.
   */
  ausschlussQuelle(pfad: string): string | null {
    if (this.wirkung(pfad) === 'ausgeschlossen') return pfad;
    for (let i = pfad.length - 1; i > 0; i--) {
      if (pfad[i] !== '/' && pfad[i] !== '@') continue;
      const anc = pfad.slice(0, i);
      if (this.wirkung(anc) === 'ausgeschlossen') return anc;
    }
    return null;
  }

  /**
   * Zahl der Vorkommen eines Elements in der Nachricht — dieselbe Konvention
   * wie im Durchlauf (`GuidedService.vorkommenAnzahl`): benannte Vorkommen
   * zaehlen, sonst steht der generische Unterbaum fuer eines, es sei denn die
   * Nachricht laesst das Element weg.
   */
  vorkommenAnzahl(pfad: string, instanz: InstanzModell): number {
    const liste = instanz.auspraegungen[pfad] ?? this.doc.auspraegungen[pfad];
    if (liste?.length) return liste.length;
    const eigen = instanz.elemente[pfad]?.status;
    if (eigen) {
      const w = this.doc.statuses.find((s) => s.id === eigen)?.wirkung;
      // Die Stufenliste der Nachricht ist die des Profils, aus dem sie
      // entstanden ist; unbekannte ids zaehlen wie „keine Aussage".
      if (w === 'ausgeschlossen') return 0;
    }
    return 1;
  }

  /**
   * Die Pfade, unter denen ein Festlegungs-Pfad in der Nachricht tatsaechlich
   * auftritt: er selbst, wenn das Element keine Vorkommen fuehrt — sonst je
   * Vorkommen einer. Ohne diese Aufloesung ginge jede Pflichtwert-Pruefung am
   * generischen Pfad ins Leere, den der Baum gar nicht rendert (#28).
   */
  instanzPfade(pfad: string, instanz: InstanzModell): string[] {
    const i = pfad.lastIndexOf('/');
    if (i < 0) return [pfad];
    const eltern = pfad.slice(0, i);
    const rest = pfad.slice(i);
    const liste = instanz.auspraegungen[eltern] ?? this.doc.auspraegungen[eltern];
    if (!liste?.length) return [pfad];
    return liste.map((a) => `${eltern}@${a.id}${rest}`);
  }

  /** Der Pfad, wie ihn die Vorgabe kennt: Kopien zeigen auf ihre Quelle (`vonId`). */
  private quellPfad(pfad: string): string {
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
}
