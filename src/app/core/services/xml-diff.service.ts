import { Injectable } from '@angular/core';
import { XmlDiffArt, XmlDiffEintrag, XmlDiffResult } from '../../models/xml-diff.model';

/**
 * Struktureller Vergleich zweier XJustiz-Instanzen (US "Was hat sich seit der
 * Abnahme geaendert?" fuer Testnachrichten).
 *
 * Verglichen werden Elementpfade, Attribute und Blattwerte — nicht Zeilen.
 * Grund: die eingefrorene Abnahme-Fassung traegt die Formatierung der
 * hochgeladenen Datei, der Arbeitsstand die des eigenen Serialisierers; ein
 * Zeilendiff bestuende fast nur aus Rauschen (ADR 0013).
 *
 * Bewusstes Nicht-Ziel: reine Umsortierungen gleichnamiger Geschwister ohne
 * fachlichen Schluessel erscheinen als Wertaenderungen — ohne Schluessel ist
 * "verschoben" von "geaendert" nicht unterscheidbar.
 */

/**
 * Lokale Namen direkter Kindelemente, die eine Wiederholung fachlich
 * identifizieren. Damit bleibt die Zuordnung stabil, wenn vorne etwas
 * eingefuegt wird — sonst gaebe es N Schein-Wertaenderungen statt einer
 * Neuaufnahme.
 */
export const SCHLUESSEL_KINDER = ['id', 'uuid', 'nummer', 'beteiligtennummer', 'kennung'];

/** Kindelemente ohne Text-/Kommentarknoten. */
function elementKinder(el: Element): Element[] {
  return Array.from(el.children);
}

/** Getrimmter Textinhalt eines Blattes; leer, wenn Kindelemente existieren. */
function blattWert(el: Element): string | undefined {
  if (el.children.length) return undefined;
  const t = (el.textContent ?? '').trim();
  return t || undefined;
}

/** Fachlicher Schluessel eines Elements, falls vorhanden. */
function schluessel(el: Element): string | undefined {
  const attr = el.getAttribute('id')?.trim();
  if (attr) return attr;
  for (const kind of elementKinder(el)) {
    if (!SCHLUESSEL_KINDER.includes(kind.localName)) continue;
    const wert = blattWert(kind);
    if (wert) return wert;
  }
  return undefined;
}

/** Anzahl aller Nachfahren-Elemente (Umfang eines Teilbaums). */
function nachfahren(el: Element): number {
  return el.getElementsByTagName('*').length;
}

/** Attribute ohne Namensraum-Deklarationen. */
function attribute(el: Element): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue;
    m.set(a.localName, a.value);
  }
  return m;
}

/** Gruppiert Geschwister nach lokalem Namen (Namensraum inklusive). */
function nachNamen(kinder: Element[]): Map<string, Element[]> {
  const m = new Map<string, Element[]>();
  for (const k of kinder) {
    const key = `${k.namespaceURI ?? ''}|${k.localName}`;
    const liste = m.get(key);
    if (liste) liste.push(k);
    else m.set(key, [k]);
  }
  return m;
}

@Injectable({ providedIn: 'root' })
export class XmlDiffService {
  /**
   * Vergleicht zwei XML-Instanzen strukturell.
   *
   * @param basis     eingefrorene Abnahme-Fassung ("entfernt" bezieht sich hierauf)
   * @param vergleich aktueller Stand ("neu" bezieht sich hierauf)
   * @throws Error bei nicht parsebarem XML
   */
  vergleiche(basis: string, vergleich: string): XmlDiffResult {
    const a = this.parse(basis, 'freigegebene Fassung');
    const b = this.parse(vergleich, 'aktueller Stand');

    if (a.localName !== b.localName) {
      return {
        eintraege: [],
        zaehler: { neu: 0, entfernt: 0, geändert: 0 },
        wurzelUnterschied: { vorher: a.localName, nachher: b.localName },
      };
    }

    const eintraege: XmlDiffEintrag[] = [];
    this.vergleicheElement(a, b, a.localName, eintraege);

    const zaehler: Record<XmlDiffArt, number> = { neu: 0, entfernt: 0, geändert: 0 };
    for (const e of eintraege) zaehler[e.art]++;
    return { eintraege, zaehler };
  }

  private parse(text: string, was: string): Element {
    const dom = new DOMParser().parseFromString(text, 'application/xml');
    const fehler = dom.querySelector('parsererror');
    const wurzel = dom.documentElement;
    if (fehler || !wurzel) throw new Error(`XML nicht lesbar (${was}).`);
    return wurzel;
  }

  /** Attribute, Blattwert und Kinder eines gematchten Elementpaars. */
  private vergleicheElement(a: Element, b: Element, pfad: string, out: XmlDiffEintrag[]): void {
    const name = pfad.split('/').pop() ?? pfad;

    const attrA = attribute(a);
    const attrB = attribute(b);
    for (const schluesselName of new Set([...attrA.keys(), ...attrB.keys()])) {
      const va = attrA.get(schluesselName);
      const vb = attrB.get(schluesselName);
      if (va === vb) continue;
      out.push({
        art: va === undefined ? 'neu' : vb === undefined ? 'entfernt' : 'geändert',
        pfad,
        name,
        attribut: schluesselName,
        vorher: va,
        nachher: vb,
      });
    }

    const wertA = blattWert(a);
    const wertB = blattWert(b);
    if (wertA !== wertB) {
      out.push({
        art: wertA === undefined ? 'neu' : wertB === undefined ? 'entfernt' : 'geändert',
        pfad,
        name,
        vorher: wertA,
        nachher: wertB,
      });
    }

    this.vergleicheKinder(elementKinder(a), elementKinder(b), pfad, out);
  }

  /** Geschwistergruppen paarweise zuordnen (Schluessel, sonst Position). */
  private vergleicheKinder(
    kinderA: Element[],
    kinderB: Element[],
    pfad: string,
    out: XmlDiffEintrag[],
  ): void {
    const gruppenA = nachNamen(kinderA);
    const gruppenB = nachNamen(kinderB);

    for (const key of new Set([...gruppenA.keys(), ...gruppenB.keys()])) {
      const listeA = gruppenA.get(key) ?? [];
      const listeB = gruppenB.get(key) ?? [];
      const lokalName = key.split('|')[1] ?? key;
      const mehrfach = listeA.length > 1 || listeB.length > 1;

      // Zuordnung ueber den fachlichen Schluessel, soweit vorhanden.
      const offenA = [...listeA];
      const offenB = [...listeB];
      const gepaart: { a?: Element; b?: Element; kennung: string }[] = [];

      for (let i = offenB.length - 1; i >= 0; i--) {
        const b = offenB[i]!;
        const s = schluessel(b);
        if (!s) continue;
        const j = offenA.findIndex((x) => schluessel(x) === s);
        if (j < 0) continue;
        gepaart.unshift({ a: offenA[j], b, kennung: `{id=${s}}` });
        offenA.splice(j, 1);
        offenB.splice(i, 1);
      }

      // Rest positionsweise — der Reihenfolge im Dokument nach.
      const paare = gepaart;
      const rest = Math.max(offenA.length, offenB.length);
      for (let i = 0; i < rest; i++) {
        const a = offenA[i];
        const b = offenB[i];
        const s = b ? schluessel(b) : a ? schluessel(a) : undefined;
        // Anzeigeindex ist die Position im jeweiligen Originaldokument.
        const pos = b ? listeB.indexOf(b) : a ? listeA.indexOf(a) : -1;
        const kennung = s ? `{id=${s}}` : mehrfach ? `[${pos + 1}]` : '';
        paare.push({ a, b, kennung });
      }

      for (const { a, b, kennung } of paare) {
        const kindPfad = `${pfad}/${lokalName}${kennung}`;
        if (a && b) {
          this.vergleicheElement(a, b, kindPfad, out);
        } else {
          // Einseitiger Teilbaum: EIN Eintrag statt einer Zeile je Nachfahre.
          const el = (a ?? b)!;
          const umfang = nachfahren(el);
          const wert = blattWert(el);
          out.push({
            art: a ? 'entfernt' : 'neu',
            pfad: kindPfad,
            name: lokalName,
            vorher: a ? wert : undefined,
            nachher: b ? wert : undefined,
            unterElemente: umfang || undefined,
          });
        }
      }
    }
  }
}
