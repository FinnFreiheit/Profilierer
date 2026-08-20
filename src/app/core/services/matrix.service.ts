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
  // lowerCamelCase der Schemanamen in Worte trennen: "datenDerUrkunde".
  const worte = roh.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return worte.charAt(0).toLocaleUpperCase('de') + worte.slice(1);
}

/**
 * Lesbare Kurzform eines Instanzpfads: die letzten beiden Segmente reichen,
 * um die Zeile zu erkennen; der volle Pfad steht im Tooltip.
 */
function kurz(pfad: string): string {
  const teile = pfad.replace(/^\//, '').split('/');
  return teile.slice(-2).join(' / ');
}

/** Index-Klammern raus, wo ueberall nur ein Vorkommen steht (Lesbarkeit). */
function ohneEinerIndex(pfad: string, mehrfach: Set<string>): string {
  return pfad.replace(/([^/[\]]+)\[(\d+)\]/g, (treffer, name: string, nr: string, pos: number) => {
    const listenPfad = pfad.slice(0, pos) + name;
    return mehrfach.has(listenPfad) ? `${name}[${nr}]` : name;
  });
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
        label: kurz(ohneEinerIndex(pfad, mehrfach)),
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
        label: kurz(ohneEinerIndex(pfad, mehrfach)),
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
