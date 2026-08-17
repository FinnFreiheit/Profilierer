import { ProfileDoc } from '../models/profile.model';
import { InstanzModell, VorgabeSicht } from './vorgabe-sicht';
import { istErweiterungsPfad, unterPfad } from './util/pfad.util';

/**
 * Erfuellbarkeits-Zuordnung ueber **kennzeichnende Festlegungen** (#116).
 *
 * Das Problem: eine XJustiz-Nachricht kann keine Vorkommen-Namen tragen, und
 * Profilierungen treffen ihre Festlegungen ueberwiegend je benanntem Vorkommen
 * — ohne Zuordnung bleiben sie ungeprueft. Eine inhaltliche Heuristik wurde in
 * der Spec zu #107 abgelehnt: raten spricht Fehlzuordnungen mit der Autoritaet
 * eines Pruefberichts aus.
 *
 * Der Ausweg ist ein Wechsel der Frage: nicht „welches Vorkommen der Nachricht
 * **ist** der Notar?" (Identifikation), sondern „gibt es eine Zuordnung, unter
 * der die Nachricht die Profilierung **einhaelt**?" (Erfuellbarkeit). Eine
 * Kante zwischen Auspraegung und Vorkommen entsteht ausschliesslich aus den
 * Festlegungen, die der Profilierer selbst als **kennzeichnend** markiert hat
 * (`ElementProfile.kennzeichnend` — Rollenbezeichnung, Anschriftstyp) und die
 * am Wert in der Nachricht nachweisbar sind. Alle uebrigen Festlegungen bilden
 * keine Kanten: sie werden am zugeordneten Paar von den bestehenden Pruefungen
 * durchgesetzt. Das trennt die zwei Maengelarten — „niemand da" (Fehlbetrag)
 * von „da, aber unvollstaendig" (Verstoss).
 *
 * Gesucht wird eine **eineindeutige** Zuordnung (verschiedene Auspraegungen
 * brauchen verschiedene Vorkommen), lexikographisch optimiert:
 *
 * 1. so viele **zwingende** Auspraegungen wie moeglich belegen — bleibt eine
 *    unbelegt, ist genau das der Befund;
 * 2. darueber hinaus so viele Vorkommen wie moeglich **aufnehmen** (Aufnahme
 *    vor Verstossarmut — ein aufgenommenes Vorkommen wird an seinen
 *    Anforderungen gemessen statt als fremd abgetan);
 * 3. unter diesen die **Verstosssumme minimieren**, gezaehlt am hoechsten
 *    Mangelknoten (eine fehlende Anschrift ist ein Verstoss, nicht ihre
 *    Pflichtfelder einzeln — sonst hinge die Zaehlung an der Ausfuehrlichkeit
 *    der Profilierung).
 *
 * Eingetragen wird die Zuordnung als `vonId` — dasselbe Feld wie die
 * Namens-Zuordnung eigener Nachrichten (`ordneVorkommenZu`); damit greifen alle
 * Pruefungen des KonformitaetService unveraendert ueber `quellPfad`/
 * `imPfadraum`, ohne dass eine Regel angefasst wird.
 *
 * **Ohne Kennzeichen kein Matching**: eine Liste, in der keine Auspraegung ein
 * Kennzeichen traegt (Bestandsprofilierungen), bleibt unangetastet — dort gibt
 * es nichts Belegbares, und das Werkzeug raet nie. Innerhalb einer Liste mit
 * Kennzeichen ist eine kennzeichenlose Auspraegung dagegen bewusst ein
 * Joker („Person, fuer die um Genehmigung ersucht wird"): sie passt auf jedes
 * Vorkommen.
 */

/** Ein zugeordnetes Paar — der Ausweis, als was ein Vorkommen gelesen wurde. */
export interface ZuordnungsEintrag {
  /** id des Vorkommens der Nachricht (Pfadraum `listPfad@id`). */
  vorkommenId: string;
  /** Anzeigename des Vorkommens („Vorkommen 1"). */
  vorkommenName: string;
  /** id der Auspraegung der Vorgabe (wird als `vonId` eingetragen). */
  auspId: string;
  auspName: string;
  /** Die nachgewiesenen Kennzeichen, menschenlesbar („rollenbezeichnung = 22"). */
  kennzeichen: string[];
}

/** Eine zwingende Auspraegung, die unbelegt bleibt — mit ehrlicher Begruendung. */
export interface FehlbetragEintrag {
  auspId: string;
  auspName: string;
  /**
   * `unvermeidbar`: in **keiner** Zuordnung mit gleich vielen belegten
   * zwingenden Auspraegungen laesst sich diese belegen — sie fehlt wirklich.
   * `austauschbar`: es gibt eine gleichwertige Zuordnung, die stattdessen eine
   * andere unbelegt liesse — die Kandidaten sind geteilt, der Bericht darf
   * keine einzelne anklagen.
   */
  klasse: 'unvermeidbar' | 'austauschbar';
  /** Vorkommen-Namen, die die Kennzeichen dieser Auspraegung erfuellen. */
  kandidaten: string[];
}

/** Ergebnis je Vorkommensliste — der Zuordnungs-Abschnitt des Pruefberichts. */
export interface ListenZuordnung {
  /** Listenpfad im Pfadraum der Nachricht. */
  listPfad: string;
  eintraege: ZuordnungsEintrag[];
  fehlbetraege: FehlbetragEintrag[];
  /**
   * Nicht aufgenommene Vorkommen der Nachricht (Namen). Offene Welt: das ist
   * ein Hinweis, kein Fehler — echte Nachrichten schleppen Gerichte,
   * Bevollmaechtigte, Verfahrenspfleger mit. Eine Grenze zieht nur die
   * max-Kardinalitaet der Profilierung (bestehende Pruefung).
   */
  unaufgenommen: string[];
  /** Gesetzt, wenn die Liste zu gross fuer die exakte Suche war. */
  uebersprungen?: string;
}

/** Ergebnis des Matchings ueber alle Listen. */
export interface KennzeichenZuordnung {
  /** Kopie des Modells mit eingetragenen `vonId`-Zuordnungen. */
  modell: InstanzModell;
  /** Listen, die das Matching zuordenbar gemacht hat. */
  zugeordnet: Set<string>;
  /** Der Ausweis fuer den Bericht — leer, wenn nirgends Kennzeichen stehen. */
  listen: ListenZuordnung[];
}

/**
 * Umgebung des Matchings: `istEnthalten` beantwortet die Anwesenheit eines
 * Pfads in der Nachricht (fuer die Verstosszaehlung an Containern); ohne die
 * Auskunft zaehlen nur Wert-Verstoesse — schwaecher, aber nie geraten.
 */
export interface MatchingUmgebung {
  istEnthalten?: (pfad: string) => boolean | null;
}

/** Obergrenzen der exakten Suche (Bitmasken-DP ueber die Auspraegungen). */
const MAX_AUSPRAEGUNGEN = 12;
const MAX_VORKOMMEN = 64;

/**
 * Ordnet die anonymen Vorkommen der Nachricht den benannten Auspraegungen der
 * Vorgabe zu — fuer alle Listen, die `bereitsZuordenbar` (Namens-Zuordnung,
 * hat Vorrang) nicht abdeckt. Von aussen nach innen: ein innerer Listenpfad
 * ist der Vorgabe erst bekannt, wenn die aeusseren Vorkommen zugeordnet sind
 * (`quellPfad` laeuft ueber `vonId`). Ein Fehlbetrag in der Tiefe schlaegt
 * dabei nicht auf die Kanten der Ebene darueber zurueck — oben zaehlt er als
 * Verstoss des Paars (Punkt 3 der Zielfunktion), unten wird er als eigener
 * Fehlbetrag gemeldet.
 */
export function kennzeichenZuordnung(
  modell: InstanzModell,
  vorgabe: ProfileDoc,
  bereitsZuordenbar: (listPfad: string) => boolean,
  umgebung: MatchingUmgebung = {},
): KennzeichenZuordnung {
  // Kopie mit kopierten Listen — `vonId` wird hier eingetragen, das
  // hereingereichte Modell bleibt unangetastet.
  const auspraegungen: InstanzModell['auspraegungen'] = {};
  for (const [pfad, liste] of Object.entries(modell.auspraegungen))
    auspraegungen[pfad] = liste.map((a) => ({ ...a }));
  const neu: InstanzModell = { elemente: modell.elemente, auspraegungen };

  // Die Sicht liest die Listen von `neu` live — jede eingetragene Zuordnung
  // macht die naechsttiefere Liste aufloesbar.
  const sicht = new VorgabeSicht(vorgabe, neu);
  const zugeordnet = new Set<string>();
  const listen: ListenZuordnung[] = [];

  for (const listPfad of Object.keys(auspraegungen).sort(
    (a, b) => a.split('/').length - b.split('/').length,
  )) {
    if (bereitsZuordenbar(listPfad)) continue;
    const vorgabeListe = sicht.ausps(listPfad);
    if (!vorgabeListe?.length) continue;

    const qList = sicht.quellPfad(listPfad);
    const ausps = vorgabeListe.map((a) => ({
      id: a.id,
      name: a.name,
      zwingend: sicht.wirkung(`${listPfad}@${a.id}`) === 'pflicht',
      kennzeichen: kennzeichenVon(vorgabe, qList, a.id),
    }));
    // Ohne ein einziges Kennzeichen in der Liste gibt es nichts Belegbares —
    // Bestandsprofilierungen bleiben unangetastet (heutiger Stand).
    if (!ausps.some((a) => a.kennzeichen.length)) continue;

    const vorkommen = auspraegungen[listPfad]!;
    if (ausps.length > MAX_AUSPRAEGUNGEN || vorkommen.length > MAX_VORKOMMEN) {
      listen.push({
        listPfad,
        eintraege: [],
        fehlbetraege: [],
        unaufgenommen: [],
        uebersprungen: `Liste zu groß für die exakte Zuordnung (${ausps.length} Ausprägungen, ${vorkommen.length} Vorkommen).`,
      });
      continue;
    }

    // Kanten und Kosten je Paar, einmal berechnet.
    const kanten = vorkommen.map((v) =>
      ausps.map((a) => a.kennzeichen.every((k) => erfuellt(neu, `${listPfad}@${v.id}`, k))),
    );
    const kosten = vorkommen.map((v, vi) =>
      ausps.map((a, ai) =>
        kanten[vi]![ai]
          ? verstossZahl(vorgabe, sicht, neu, listPfad, v.id, qList, a.id, umgebung)
          : 0,
      ),
    );

    const ergebnis = loeseZuordnung(
      ausps.map((a) => a.zwingend),
      kanten,
      kosten,
    );

    const eintraege: ZuordnungsEintrag[] = [];
    for (let vi = 0; vi < vorkommen.length; vi++) {
      const ai = ergebnis.wahl[vi];
      if (ai == null) continue;
      const v = vorkommen[vi]!;
      const a = ausps[ai]!;
      v.vonId = a.id;
      eintraege.push({
        vorkommenId: v.id,
        vorkommenName: v.name,
        auspId: a.id,
        auspName: a.name,
        kennzeichen: a.kennzeichen.map((k) => kennzeichenText(neu, `${listPfad}@${v.id}`, k)),
      });
    }

    // Unbelegte zwingende Auspraegungen, zweiklassig begruendet: unvermeidbar
    // (kein gleich gutes Matching belegt sie) oder austauschbar (eine andere
    // koennte stattdessen unbelegt bleiben — die Kandidaten sind geteilt).
    const belegt = new Set(eintraege.map((e) => e.auspId));
    const fehlbetraege: FehlbetragEintrag[] = [];
    for (let ai = 0; ai < ausps.length; ai++) {
      const a = ausps[ai]!;
      if (!a.zwingend || belegt.has(a.id)) continue;
      const kandidaten = vorkommen.filter((_, vi) => kanten[vi]![ai]).map((v) => v.name);
      fehlbetraege.push({
        auspId: a.id,
        auspName: a.name,
        klasse:
          kandidaten.length && ergebnis.zwingendMitAusp[ai] === ergebnis.zwingend
            ? 'austauschbar'
            : 'unvermeidbar',
        kandidaten,
      });
    }

    zugeordnet.add(listPfad);
    listen.push({
      listPfad,
      eintraege,
      fehlbetraege,
      unaufgenommen: vorkommen.filter((v) => !v.vonId).map((v) => v.name),
    });
  }

  return { modell: neu, zugeordnet, listen };
}

/** Ein Kennzeichen: generischer Teilpfad unter dem Vorkommen + zulaessige Werte. */
interface Kennzeichen {
  suffix: string;
  werte: string[];
}

/**
 * Die kennzeichnenden Festlegungen einer Auspraegung: markierte Wertelisten an
 * Pfaden unterhalb von `qList@auspId`. Teilpfade mit eigenem `@` (tiefere
 * benannte Vorkommen) gehoeren zum Matching der inneren Ebene, nicht zur Kante
 * der aeusseren; Erweiterungspfade kann eine Nachricht nicht tragen.
 */
function kennzeichenVon(vorgabe: ProfileDoc, qList: string, auspId: string): Kennzeichen[] {
  const praefix = `${qList}@${auspId}/`;
  const out: Kennzeichen[] = [];
  for (const [pfad, e] of Object.entries(vorgabe.elemente)) {
    if (!e.kennzeichnend || !e.werte?.length) continue;
    if (!pfad.startsWith(praefix)) continue;
    const suffix = pfad.slice(praefix.length);
    if (suffix.includes('@') || istErweiterungsPfad(pfad)) continue;
    out.push({ suffix, werte: e.werte });
  }
  return out.sort((a, b) => a.suffix.localeCompare(b.suffix));
}

/**
 * Alle Pfade, unter denen ein generischer Teilpfad im Teilbaum eines
 * Vorkommens der **Nachricht** liegt: wiederholbare Zwischenelemente faechern
 * ueber die Vorkommenslisten der Nachricht auf (ein Beteiligter kann mehrere
 * Rollen tragen — erfuellt ist die Kennung, wenn **eine** davon passt).
 */
function instanzPfade(modell: InstanzModell, basis: string, suffix: string): string[] {
  let front = [basis];
  for (const seg of suffix.split('/')) {
    const naechste: string[] = [];
    for (const f of front) {
      const el = `${f}/${seg}`;
      const liste = modell.auspraegungen[el];
      if (liste?.length) for (const a of liste) naechste.push(`${el}@${a.id}`);
      else naechste.push(el);
    }
    front = naechste;
  }
  return front;
}

/** Erfuellt der Teilbaum des Vorkommens die kennzeichnende Werteliste? */
function erfuellt(modell: InstanzModell, vorkommenPfad: string, k: Kennzeichen): boolean {
  return instanzPfade(modell, vorkommenPfad, k.suffix).some((p) => {
    const wert = modell.elemente[p]?.beispiel?.trim();
    return !!wert && k.werte.includes(wert);
  });
}

/** Menschenlesbarer Nachweis eines Kennzeichens („rollenbezeichnung = 22"). */
function kennzeichenText(modell: InstanzModell, vorkommenPfad: string, k: Kennzeichen): string {
  const name = k.suffix.split('/').at(-1)!.split('#')[0]!;
  const wert = instanzPfade(modell, vorkommenPfad, k.suffix)
    .map((p) => modell.elemente[p]?.beispiel?.trim())
    .find((w) => !!w && k.werte.includes(w));
  return `${name} = ${wert ?? k.werte.join('|')}`;
}

/**
 * Verstosszaehlung eines Kandidaten-Paars — der Preis in Stufe 3 der
 * Zielfunktion. Gezaehlt werden die **nicht** kennzeichnenden durchsetzbaren
 * Festlegungen unter der Auspraegung, die das Vorkommen verletzt:
 *
 * - zwingend gesetzt, aber nachweislich nicht enthalten (`istEnthalten` ===
 *   false; ohne die Auskunft wird nicht geraten) — gezaehlt am **hoechsten**
 *   Mangelknoten: unter einem fehlenden Container zaehlt nichts mehr;
 * - Werteliste verletzt (ein belegter Wert liegt ausserhalb).
 *
 * Tiefere benannte Vorkommen (`@` im Teilpfad) zaehlen hier nicht: ihre
 * Zuordnung ist das Matching der inneren Ebene, ihre Maengel meldet der
 * Bericht dort. Die Zaehlung ist ein Rangkriterium unter erfuellbaren
 * Zuordnungen, kein Bericht — die endgueltigen Verstoesse ermittelt der
 * KonformitaetService am zugeordneten Paar.
 */
function verstossZahl(
  vorgabe: ProfileDoc,
  sicht: VorgabeSicht,
  modell: InstanzModell,
  listPfad: string,
  vorkommenId: string,
  qList: string,
  auspId: string,
  umgebung: MatchingUmgebung,
): number {
  const praefix = `${qList}@${auspId}/`;
  const basis = `${listPfad}@${vorkommenId}`;
  const fehlt: string[] = [];
  let verstoesse = 0;
  for (const [pfad, e] of Object.entries(vorgabe.elemente)) {
    if (!pfad.startsWith(praefix)) continue;
    const suffix = pfad.slice(praefix.length);
    if (suffix.includes('@') || istErweiterungsPfad(pfad)) continue;
    const pfade = instanzPfade(modell, basis, suffix);
    const wirkung = e.status && vorgabe.statuses.find((s) => s.id === e.status)?.wirkung;
    if (wirkung === 'pflicht' && umgebung.istEnthalten) {
      const auskuenfte = pfade.map(
        (p) => !!modell.elemente[p]?.beispiel?.trim() || umgebung.istEnthalten!(p),
      );
      if (auskuenfte.length && auskuenfte.every((x) => x === false)) fehlt.push(suffix);
    }
    if (e.werte?.length && !e.kennzeichnend) {
      const werte = pfade
        .map((p) => modell.elemente[p]?.beispiel?.trim())
        .filter((w): w is string => !!w);
      if (werte.some((w) => !e.werte!.includes(w))) verstoesse++;
    }
  }
  // Hoechster Mangelknoten: was unter einem fehlenden Vorfahren liegt, zaehlt
  // nicht noch einmal.
  fehlt.sort((a, b) => a.length - b.length);
  const gezaehlt: string[] = [];
  for (const s of fehlt) if (!gezaehlt.some((g) => unterPfad(s, g))) gezaehlt.push(s);
  return verstoesse + gezaehlt.length;
}

/** Ergebnis der exakten Suche. */
interface Loesung {
  /** Je Vorkommen der Index der zugeordneten Auspraegung (null = keins). */
  wahl: (number | null)[];
  /** Belegte zwingende Auspraegungen im Optimum. */
  zwingend: number;
  /**
   * Je Auspraegung: wie viele zwingende belegt die beste Zuordnung, die
   * **diese** Auspraegung belegt? Traegt die Klassifikation der Fehlbetraege:
   * erreicht sie das Optimum, ist die Auspraegung austauschbar unbelegt.
   */
  zwingendMitAusp: number[];
}

/** Bewertung einer Teilzuordnung — lexikographisch (zwingend, Aufnahme, -Kosten). */
interface Wert {
  z: number;
  n: number;
  c: number;
}

function besser(a: Wert, b: Wert): boolean {
  if (a.z !== b.z) return a.z > b.z;
  if (a.n !== b.n) return a.n > b.n;
  return a.c < b.c;
}

/**
 * Exakte Loesung des Zuordnungsproblems als Bitmasken-DP ueber die
 * Auspraegungen: Vorkommen der Reihe nach betrachtet, Zustand ist die Menge
 * der bereits belegten Auspraegungen. Die Listen sind klein (Obergrenzen
 * oben); exakt und billig schlaegt approximativ und erklaerungsbeduerftig.
 */
function loeseZuordnung(zwingend: boolean[], kanten: boolean[][], kosten: number[][]): Loesung {
  const nA = zwingend.length;
  const nV = kanten.length;
  const groesse = 1 << nA;

  // dp[schritt][maske] — bestes Ergebnis nach `schritt` Vorkommen mit belegter
  // Auspraegungs-Menge `maske`; Rueckverweise fuer die Rekonstruktion.
  let dp: (Wert | null)[] = new Array(groesse).fill(null);
  dp[0] = { z: 0, n: 0, c: 0 };
  const herkunft: Int32Array[] = []; // je Schritt: maske -> gewaehlte Auspraegung (-1 = keine, -2 = unerreichbar)

  for (let vi = 0; vi < nV; vi++) {
    const next: (Wert | null)[] = new Array(groesse).fill(null);
    const her = new Int32Array(groesse).fill(-2);
    for (let maske = 0; maske < groesse; maske++) {
      const cur = dp[maske];
      if (!cur) continue;
      // Vorkommen nicht aufnehmen.
      if (!next[maske] || besser(cur, next[maske]!)) {
        next[maske] = cur;
        her[maske] = -1;
      }
      // Vorkommen einer freien, verbundenen Auspraegung zuordnen.
      for (let ai = 0; ai < nA; ai++) {
        if (maske & (1 << ai)) continue;
        if (!kanten[vi]![ai]) continue;
        const neu: Wert = {
          z: cur.z + (zwingend[ai] ? 1 : 0),
          n: cur.n + 1,
          c: cur.c + kosten[vi]![ai]!,
        };
        const ziel = maske | (1 << ai);
        if (!next[ziel] || besser(neu, next[ziel]!)) {
          next[ziel] = neu;
          her[ziel] = ai;
        }
      }
    }
    dp = next;
    herkunft.push(her);
  }

  let besteMaske = 0;
  for (let maske = 1; maske < groesse; maske++) {
    if (dp[maske] && (!dp[besteMaske] || besser(dp[maske]!, dp[besteMaske]!))) besteMaske = maske;
  }
  const optimum = dp[besteMaske] ?? { z: 0, n: 0, c: 0 };

  // Klassifikation: das beste Zwingend-Ergebnis unter allen Endzustaenden, die
  // Auspraegung ai belegen — direkt aus der DP-Endtabelle ablesbar.
  const zwingendMitAusp = new Array<number>(nA).fill(-1);
  for (let maske = 0; maske < groesse; maske++) {
    const w = dp[maske];
    if (!w) continue;
    for (let ai = 0; ai < nA; ai++)
      if (maske & (1 << ai)) zwingendMitAusp[ai] = Math.max(zwingendMitAusp[ai]!, w.z);
  }

  // Rekonstruktion rueckwaerts ueber die Herkunfts-Tabellen.
  const wahl: (number | null)[] = new Array(nV).fill(null);
  let maske = besteMaske;
  for (let vi = nV - 1; vi >= 0; vi--) {
    const ai = herkunft[vi]![maske]!;
    if (ai >= 0) {
      wahl[vi] = ai;
      maske &= ~(1 << ai);
    }
  }
  return { wahl, zwingend: optimum.z, zwingendMitAusp };
}
