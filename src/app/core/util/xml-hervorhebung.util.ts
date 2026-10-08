/**
 * Farbliche Hervorhebung der XML-Darstellung (Editor v4, Etappe E6).
 *
 * Die XML-Karte zeigt die erzeugte Beispiel- bzw. Testnachricht Zeile fuer
 * Zeile. Damit ein fachfremder Leser Tag und Inhalt auseinanderhaelt, wird
 * jede Zeile in Marken zerlegt; die Farbe haengt allein an der Marken-Art.
 *
 * Bewusst kein Parser: die Zeilen kommen aus dem eigenen Erzeuger
 * (`ExportService.buildBeispielXmlMitPfaden`), sind also wohlgeformt und
 * bereits maskiert (`esc()` ersetzt `<`, `>`, `&`, `"`). Deshalb genuegt eine
 * Zeilen-Zerlegung ohne DOM — sie ist rein, schnell und faellt bei unerwarteter
 * Eingabe auf `text` zurueck, statt zu werfen.
 *
 * Zustand haelt die Funktion keinen: mehrzeilige Kommentare kommen ueber den
 * zweiten Parameter `imKommentar` herein. Wer eine ganze Datei zerlegt, fuehrt
 * das Kennzeichen mit `kommentarOffen()` von Zeile zu Zeile weiter.
 */

/** Art einer Marke — bestimmt allein die Farbe in der XML-Karte. */
export type XmlTokenArt = 'dekl' | 'kommentar' | 'tag' | 'attr' | 'attrwert' | 'wert' | 'text';

/** Eine Marke einer XML-Zeile. */
export interface XmlToken {
  art: XmlTokenArt;
  text: string;
}

/** Ein Tag (oeffnend, schliessend oder leer) — Attributwerte sind maskiert. */
const TAG_RE = /<\/?[A-Za-z_][\w.\-:]*(?:\s[^<>]*?)?\/?>/g;
/** Attribut innerhalb eines Tags: Name, Gleichheitszeichen, Wert in Anfuehrung. */
const ATTR_RE = /([\w.\-:]+)(\s*=\s*)("[^"]*"|'[^']*')/g;

/** Anfuehrende Einrueckung als eigene Marke (`text`) abtrennen. */
function einrueckung(zeile: string): { pad: string; rest: string } {
  const m = /^\s+/.exec(zeile);
  return m ? { pad: m[0], rest: zeile.slice(m[0].length) } : { pad: '', rest: zeile };
}

/** Das Innere eines Tags zerlegen: Name als `tag`, Attribute als `attr`/`attrwert`. */
function tagMarken(tag: string, ziel: XmlToken[]): void {
  // `<name` bzw. `</name` — bis zum ersten Leerzeichen oder zum Tag-Ende.
  const kopf = /^<\/?[A-Za-z_][\w.\-:]*/.exec(tag);
  if (!kopf) {
    ziel.push({ art: 'tag', text: tag });
    return;
  }
  ziel.push({ art: 'tag', text: kopf[0] });
  const rest = tag.slice(kopf[0].length);
  ATTR_RE.lastIndex = 0;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(rest))) {
    if (m.index > pos) ziel.push({ art: 'tag', text: rest.slice(pos, m.index) });
    ziel.push({ art: 'attr', text: m[1]! + m[2]! });
    ziel.push({ art: 'attrwert', text: m[3]! });
    pos = m.index + m[0].length;
  }
  if (pos < rest.length) ziel.push({ art: 'tag', text: rest.slice(pos) });
}

/**
 * Eine Zeile in Marken zerlegen.
 *
 * @param zeile   die Zeile ohne Zeilenumbruch
 * @param imKommentar ob die Zeile in einem noch offenen `<!-- … -->` liegt
 */
export function tokenisiereXmlZeile(zeile: string, imKommentar = false): XmlToken[] {
  if (zeile === '') return [];
  if (imKommentar) return [{ art: 'kommentar', text: zeile }];

  const { pad, rest } = einrueckung(zeile);
  const marken: XmlToken[] = [];
  if (pad) marken.push({ art: 'text', text: pad });
  if (rest === '') return marken;

  // Deklaration und Kommentaranfang nehmen die ganze Zeile — innerhalb beider
  // gibt es nichts zu unterscheiden, was dem Leser hilft.
  if (rest.startsWith('<?')) {
    marken.push({ art: 'dekl', text: rest });
    return marken;
  }
  if (rest.startsWith('<!--')) {
    marken.push({ art: 'kommentar', text: rest });
    return marken;
  }

  TAG_RE.lastIndex = 0;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(rest))) {
    if (m.index > pos) {
      const zwischen = rest.slice(pos, m.index);
      // Inhalt zwischen zwei Tags ist der Wert; reiner Zwischenraum bleibt Text.
      marken.push({ art: zwischen.trim() ? 'wert' : 'text', text: zwischen });
    }
    tagMarken(m[0], marken);
    pos = m.index + m[0].length;
  }
  if (pos < rest.length) {
    const schwanz = rest.slice(pos);
    marken.push({ art: schwanz.trim() ? 'wert' : 'text', text: schwanz });
  }
  return marken;
}

/**
 * Laeuft der Kommentar nach dieser Zeile weiter? Der Aufrufer fuehrt das
 * Kennzeichen von Zeile zu Zeile mit und reicht es an `tokenisiereXmlZeile`.
 */
export function kommentarOffen(zeile: string, imKommentar = false): boolean {
  if (imKommentar) return !zeile.includes('-->');
  const auf = zeile.lastIndexOf('<!--');
  if (auf < 0) return false;
  return zeile.indexOf('-->', auf + 4) < 0;
}
