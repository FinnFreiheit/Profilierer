import { Injectable } from '@angular/core';
import { MatrixResult, MatrixSpalte, MatrixZeile } from '../../models/matrix.model';

/**
 * Der n-Wege-Vergleich hinter der Merkmals-Matrix (#136): mehrere
 * XJustiz-Instanzen nebeneinander, Zeilen nur dort, wo sie voneinander
 * abweichen.
 *
 * Nicht zu verwechseln mit dem XmlDiffService — der stellt **zwei** Fassungen
 * derselben Nachricht gegenueber (Arbeitsstand gegen eingefrorene Abnahme) und
 * bleibt der Detailvergleich, den die Matrix fuer ein Spaltenpaar oeffnet.
 *
 * Die zentrale Entscheidung steckt in der Zusammenfassung: "einmal ein
 * Beteiligter, einmal zwei" ist **ein** Unterschied, nicht fuenfzig fehlende
 * Pfade. Deshalb stehen Vorkommen-Anzahlen als eigene Zeilen oben, und die
 * Werte der ueberzaehligen Vorkommen liegen eingeklappt darunter.
 */

/** Zeilendeckel wie in den uebrigen Vergleichsansichten. */
export const MATRIX_MAX_ZEILEN = 800;

/**
 * Pfad-Endungen technischer Kopfangaben. Sie unterscheiden sich zwischen
 * gefuehrt erstellten Nachrichten **immer** und stuenden sonst als Rauschen
 * ganz oben. Bewusst eine kurze, benannte Liste statt einer Heuristik ueber
 * "sieht aus wie eine UUID": eine Heuristik waere in einem Jahr Aberglaube.
 *
 * Nicht enthalten sind Absender und Empfaenger — die sind bei einem
 * Kommunikationsszenario gerade die fachliche Aussage.
 */
export const TECHNISCHE_ANGABEN = [
  'nachrichtenkopf/erstellungszeitpunkt',
  'nachrichtenkopf/eigeneNachrichtenID',
  'nachrichtenkopf/fremdeNachrichtenID',
  'nachrichtenkopf/uuid',
];

/** Eine Nachricht als Eingabe der Matrix. */
export interface MatrixQuelle {
  id: string;
  name: string;
  xml: string;
}

/** Ausgelesener Stand einer Nachricht: Werte je Pfad, Anzahlen je Listenpfad. */
interface Extrakt {
  werte: Map<string, string>;
  anzahlen: Map<string, number>;
}

/** Getrimmter Textinhalt eines Blattes; leer, wenn Kindelemente existieren. */
function blattWert(el: Element): string | undefined {
  if (el.children.length) return undefined;
  const t = (el.textContent ?? '').trim();
  return t || undefined;
}

/**
 * Liest eine Instanz aus. Vorkommen werden **immer** indiziert (`[1]`, `[2]`),
 * auch bei einem einzigen: sonst truege dieselbe Angabe in einer Nachricht mit
 * einem und einer mit zwei Beteiligten verschiedene Pfade und erschiene als
 * Unterschied, wo keiner ist.
 */
function extrahiere(xml: string): Extrakt | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || !doc.documentElement) return null;
  const werte = new Map<string, string>();
  const anzahlen = new Map<string, number>();

  const lauf = (el: Element, pfad: string): void => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
      werte.set(`${pfad}@${attr.localName}`, attr.value);
    }
    const gruppen = new Map<string, Element[]>();
    for (const kind of Array.from(el.children)) {
      const liste = gruppen.get(kind.localName);
      if (liste) liste.push(kind);
      else gruppen.set(kind.localName, [kind]);
    }
    for (const [name, kinder] of gruppen) {
      const listenPfad = `${pfad}/${name}`;
      anzahlen.set(listenPfad, kinder.length);
      kinder.forEach((kind, i) => {
        const kindPfad = `${listenPfad}[${i + 1}]`;
        const wert = blattWert(kind);
        if (wert !== undefined) {
          werte.set(kindPfad, wert);
          for (const attr of Array.from(kind.attributes)) {
            if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
            werte.set(`${kindPfad}@${attr.localName}`, attr.value);
          }
        } else {
          lauf(kind, kindPfad);
        }
      });
    }
  };

  lauf(doc.documentElement, `/${doc.documentElement.localName}`);
  return { werte, anzahlen };
}

/**
 * Technische Kopfangabe? Verglichen wird ohne Vorkommens-Indizes: im Pfad steht
 * `nachrichtenkopf[1]/erstellungszeitpunkt[1]`, in der Liste die nackte Form.
 */
function istTechnisch(pfad: string): boolean {
  const nackt = pfad.replace(/\[\d+\]/g, '');
  return TECHNISCHE_ANGABEN.some((t) => nackt.includes(t));
}

/**
 * Fachlicher Bereich eines Pfads: das 2. Segment, lesbar gemacht
 * (`/nachricht.x/grunddaten[1]/…` → "Grunddaten"). XJustiz-Nachrichten sind
 * dort klar gegliedert — Nachrichtenkopf, Grunddaten, Fachdaten,
 * Schriftgutobjekte —, und genau diese Gliederung braucht der Vergleich.
 *
 * Was direkt an der Wurzel haengt (Attribute der Nachricht selbst), kommt unter
 * "Nachricht": eine eigene Gruppe ist ehrlicher als es dem Nachrichtenkopf
 * zuzuschlagen, wo es nicht steht.
 */
function bereichVon(pfad: string): string {
  const segmente = pfad.replace(/^\//, '').split('/');
  const roh = (segmente[1] ?? '').replace(/\[\d+\].*$/, '').replace(/@.*$/, '');
  if (!roh) return 'Nachricht';
  return inWorte(roh);
}

/** lowerCamelCase eines Schemanamens in Worte: "natuerlichePerson". */
function inWorte(roh: string): string {
  const worte = roh.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return worte.charAt(0).toLocaleUpperCase('de') + worte.slice(1);
}

/**
 * Die Bezeichnung eines Merkmals, wie ein Mensch sie liest:
 * `Beteiligung 2 › Natuerliche Person › Geschlecht`.
 *
 * Vorher standen hier die letzten beiden Pfadsegmente im Rohzustand
 * (`natuerlichePerson / geschlecht`) — Feldnamen aus einer Datei, keine
 * Aussage. Vor allem ging die Vorkommen-Nummer unter, obwohl sie das
 * Wichtigste ist: dass es der **zweite** Beteiligte ist, beantwortet die halbe
 * Frage. Sie steht deshalb hinter dem Namen statt als Klammerindex mittendrin.
 *
 * Der Bereich (2. Segment) faellt weg — er ist die Gruppenueberschrift. Ein
 * Attribut wird als solches ausgewiesen.
 */
function bezeichnung(pfad: string, mehrfach: Set<string>): string {
  const [reinerPfad, attribut] = pfad.split('@');
  const teile = (reinerPfad ?? '').replace(/^\//, '').split('/');
  // Wurzel und Bereich weg: beide stehen schon in der Gruppenueberschrift.
  const rest = teile.slice(2);
  if (!rest.length)
    return attribut ? `Attribut ${attribut}` : inWorte(teile[teile.length - 1] ?? '');

  let gelaufen = `/${teile[0]}/${teile[1]}`;
  const segmente: string[] = [];
  for (const seg of rest) {
    const treffer = /^(.+)\[(\d+)\]$/.exec(seg);
    const name = treffer ? (treffer[1] ?? seg) : seg;
    const listenPfad = `${gelaufen}/${name}`;
    gelaufen += `/${seg}`;
    // `auswahl_*` sind die Choice-Container des XJustiz-Schemas: technische
    // Klammern ohne fachliche Aussage, die die Kette nur verlaengern.
    if (name.startsWith('auswahl_')) continue;
    // Die Nummer nur, wo es ueberhaupt mehrere gibt — sonst waere sie Ballast.
    segmente.push(
      treffer && mehrfach.has(listenPfad) ? `${inWorte(name)} ${treffer[2]}` : inWorte(name),
    );
  }
  return zusammenfassen(segmente, attribut);
}

/**
 * Die Kette auf das kuerzen, was die Aussage traegt. Vollstaendig ist sie
 * unbrauchbar breit — "Verfahrensdaten › Beteiligung 1 › Beteiligter › Auswahl
 * beteiligter › Natuerliche Person › Anschrift › Anschriftstyp 4" sprengt jede
 * Spalte.
 *
 * Behalten werden die Glieder **mit Vorkommen-Nummer** (dass es der zweite
 * Beteiligte ist, ist der halbe Befund) und die letzten beiden (das Merkmal
 * selbst und sein Traeger). Was dazwischen wegfaellt, wird als "…" ausgewiesen
 * statt stillschweigend geschluckt; der volle Pfad steht im Tooltip.
 */
function zusammenfassen(segmente: string[], attribut?: string): string {
  const behalten = new Set<number>();
  segmente.forEach((seg, i) => {
    if (/ \d+$/.test(seg)) behalten.add(i);
  });
  behalten.add(segmente.length - 1);
  if (segmente.length > 1) behalten.add(segmente.length - 2);

  const teile: string[] = [];
  let luecke = false;
  segmente.forEach((seg, i) => {
    if (behalten.has(i)) {
      if (luecke) teile.push('…');
      teile.push(seg);
      luecke = false;
    } else if (teile.length) {
      // Nur zwischen zwei Gliedern: ein fuehrendes "…" traegt nichts bei, dass
      // oben etwas weggelassen wurde, ist ohnehin klar.
      luecke = true;
    }
  });
  const text = teile.join(' › ');
  return attribut ? `${text} · Attribut ${attribut}` : text;
}

@Injectable({ providedIn: 'root' })
export class MatrixService {
  /**
   * Baut die Matrix aus mehreren Nachrichten. Nicht parsbare Quellen fallen
   * weg (sie kaemen sonst als "alles fehlt"-Spalte durch); bei weniger als zwei
   * verwertbaren Quellen bleibt die Zeilenliste leer.
   */
  vergleiche(quellen: readonly MatrixQuelle[]): MatrixResult {
    const spalten: MatrixSpalte[] = [];
    const extrakte: Extrakt[] = [];
    for (const q of quellen) {
      const e = extrahiere(q.xml);
      if (!e) continue;
      spalten.push({ id: q.id, name: q.name });
      extrakte.push(e);
    }
    if (extrakte.length < 2) return { spalten, zeilen: [], bereiche: [] };

    // ── Anzahl-Zeilen ────────────────────────────────────────────────
    // Ein fehlender Listenpfad ist eine Null, kein Loch: "hat keinen
    // Beteiligten" ist gegenueber "hat zwei" genau die Aussage der Zeile.
    const listenPfade = new Set(extrakte.flatMap((e) => [...e.anzahlen.keys()]));
    const mehrfach = new Set<string>();
    const minAnzahl = new Map<string, number>();
    for (const pfad of listenPfade) {
      const zahlen = extrakte.map((e) => e.anzahlen.get(pfad) ?? 0);
      minAnzahl.set(pfad, Math.min(...zahlen));
      if (Math.max(...zahlen) > 1) mehrfach.add(pfad);
    }
    // Erst nach der vollstaendigen minAnzahl-Karte: auch eine Anzahl-Zeile kann
    // in einem ueberzaehligen Vorkommen liegen (die Angaben des zweiten
    // Beteiligten "fehlen" in der Nachricht mit einem) und gehoert dann
    // eingeklappt darunter — sonst waere der eine Unterschied wieder viele.
    const anzahlZeilen: MatrixZeile[] = [];
    for (const pfad of listenPfade) {
      const zahlen = extrakte.map((e) => e.anzahlen.get(pfad) ?? 0);
      if (new Set(zahlen).size <= 1) continue;
      anzahlZeilen.push({
        art: 'anzahl',
        bereich: bereichVon(pfad),
        pfad,
        label: bezeichnung(pfad, mehrfach),
        werte: zahlen.map((n) => String(n)),
        unterhalb: this.ueberzaehligesVorkommen(pfad, minAnzahl),
      });
    }

    // ── Wert-Zeilen ──────────────────────────────────────────────────
    const wertPfade = new Set(extrakte.flatMap((e) => [...e.werte.keys()]));
    const wertZeilen: MatrixZeile[] = [];
    for (const pfad of wertPfade) {
      const werte = extrakte.map((e) => e.werte.get(pfad));
      if (new Set(werte).size <= 1) continue;
      wertZeilen.push({
        art: 'wert',
        bereich: bereichVon(pfad),
        pfad,
        label: bezeichnung(pfad, mehrfach),
        werte,
        unterhalb: this.ueberzaehligesVorkommen(pfad, minAnzahl),
        technisch: istTechnisch(pfad) || undefined,
      });
    }

    // Nach Bereich, darin Anzahl-Zeilen vor Wert-Zeilen (die Anzahl traegt die
    // groebere Aussage), darin nach Pfad. Die Reihenfolge der Bereiche folgt
    // dem Aufbau der Nachricht — sie ergibt sich aus dem Pfad und muss nicht
    // gepflegt werden.
    // Reihenfolge des ersten Auftretens = Dokumentreihenfolge: die Maps in
    // `extrahiere` werden beim Durchlauf gefuellt und bewahren sie. Alphabetisch
    // stuenden die Fachdaten vor dem Nachrichtenkopf, was dem Aufbau einer
    // XJustiz-Nachricht widerspricht.
    const rang = new Map<string, number>();
    for (const z of [...wertZeilen, ...anzahlZeilen])
      if (!rang.has(z.bereich)) rang.set(z.bereich, rang.size);
    const bereichsRang = (name: string): number => rang.get(name) ?? Number.MAX_SAFE_INTEGER;

    const sortiert = [...anzahlZeilen, ...wertZeilen].sort(
      (a, b) =>
        bereichsRang(a.bereich) - bereichsRang(b.bereich) ||
        (a.art === b.art ? 0 : a.art === 'anzahl' ? -1 : 1) ||
        a.pfad.localeCompare(b.pfad),
    );
    const zeilen = sortiert.slice(0, MATRIX_MAX_ZEILEN);
    const abgeschnitten = sortiert.length - zeilen.length;

    // Gezaehlt wird, was der Leser sieht: technische Angaben sind
    // standardmaessig aus, ihr Bereich soll deswegen keinen Zaehler auswerfen,
    // der zu nichts fuehrt.
    const bereiche: { name: string; n: number }[] = [];
    for (const z of zeilen) {
      if (z.technisch || z.unterhalb) continue;
      const treffer = bereiche.find((b) => b.name === z.bereich);
      if (treffer) treffer.n++;
      else bereiche.push({ name: z.bereich, n: 1 });
    }

    return { spalten, zeilen, bereiche, abgeschnitten: abgeschnitten || undefined };
  }

  /**
   * Liegt der Pfad in einem Vorkommen, das **nicht** alle Nachrichten haben?
   * Dann gehoert er unter die Anzahl-Zeile des betroffenen Listenpfads und
   * erscheint erst beim Aufklappen. Massgeblich ist das aeusserste solche
   * Vorkommen — es erklaert alles darunter.
   */
  private ueberzaehligesVorkommen(
    pfad: string,
    minAnzahl: ReadonlyMap<string, number>,
  ): string | undefined {
    const treffer = [...pfad.matchAll(/\[(\d+)\]/g)];
    for (const t of treffer) {
      const listenPfad = pfad.slice(0, t.index);
      const min = minAnzahl.get(listenPfad);
      if (min !== undefined && Number(t[1]) > min) return listenPfad;
    }
    return undefined;
  }
}
