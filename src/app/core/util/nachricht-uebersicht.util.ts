import { pretty } from './pretty.util';

/**
 * Kompakte Uebersicht einer Testnachricht (PDF-Export): die Nachricht in ihrer
 * eigenen Gliederung, nur lesbar gesetzt. Reihenfolge und Ebenen bleiben wie
 * im XML; weggelassen wird, was keinen Inhalt traegt (Auswahl-Huellen,
 * Container mit nur einem Kind) oder rein technisch ist (UUIDs,
 * Herstellerinformation). Jedes Hauptelement (Nachrichtenkopf, Grunddaten, …)
 * wird ein eigener Abschnitt — im Druck eine eigene Seite.
 */

export interface UebersichtZeile {
  art: 'gruppe' | 'wert';
  /** Einrueckungsebene innerhalb des Abschnitts (0 = oberste). */
  ebene: number;
  name: string;
  wert?: string;
  /** Codelisten-Bezeichnung bzw. ergaenzende Angabe hinter dem Wert. */
  zusatz?: string;
}

export interface UebersichtAbschnitt {
  titel: string;
  zeilen: UebersichtZeile[];
}

export interface NachrichtUebersicht {
  /** Anzeigename der Nachricht, z. B. „Enova — Entscheidung". */
  titel: string;
  /** Technischer Nachrichtenname (Root-Element). */
  nachricht: string;
  /** xjustizVersion aus dem Nachrichtenkopf, sonst leer. */
  version: string;
  abschnitte: UebersichtAbschnitt[];
}

/** Bezeichnung zu einem Code — null, wenn die Codeliste nicht vorliegt. */
export type CodeBezeichnung = (listURI: string, code: string) => string | null;

/** Was beim Ableiten durchgereicht wird: Codelisten und die Schriftgutobjekte der Nachricht. */
interface Kontext {
  cb: CodeBezeichnung;
  /** UUID (identifikation/id) → Benennung des Schriftgutobjekts. */
  sgo: Map<string, { titel: string; anzeigename?: string }>;
}

/** Huellen ohne eigene Aussage: ihr Inhalt rueckt eine Ebene hoch. */
const HUELLEN = new Set(['xjustiz.fachspezifischeDaten', 'informationen', 'beteiligter']);
/** Rein technische Bloecke, die fuer den Inhalt nichts sagen. */
const TECHNISCH = new Set(['herstellerinformation']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kinder(el: Element): Element[] {
  return Array.from(el.children);
}

function text(el: Element): string {
  return (el.textContent ?? '').trim();
}

/** Code-Element: `<x listURI="…"><code>…</code></x>`. */
function istCode(el: Element): boolean {
  const k = kinder(el);
  return k.length > 0 && k.every((c) => c.localName === 'code' || c.localName === 'name');
}

/** Datum/Zeit ins deutsche Format, sonst unveraendert. */
export function formatiereWert(v: string): string {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(v);
  if (m) return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}${m[6] === 'Z' ? ' UTC' : ''}`;
  if (v === 'true') return 'ja';
  if (v === 'false') return 'nein';
  return v;
}

function codeZeile(el: Element, ebene: number, { cb }: Kontext): UebersichtZeile {
  const code = text(el.querySelector(':scope > code') ?? el);
  const uri = el.getAttribute('listURI');
  const bez = uri ? cb(uri, code) : null;
  return { art: 'wert', ebene, name: pretty(el.localName), wert: code, zusatz: bez ?? undefined };
}

/** Vor- und Nachname in eine Zeile („Name"). */
function nameZeile(el: Element, ebene: number): UebersichtZeile | null {
  const k = kinder(el);
  if (!k.length || k.some((c) => c.children.length)) return null;
  const teile = k.map(text).filter(Boolean);
  return teile.length ? { art: 'wert', ebene, name: 'Name', wert: teile.join(' ') } : null;
}

const ANSCHRIFT_TEILE = new Set([
  'anschriftstyp',
  'strasse',
  'hausnummer',
  'postleitzahl',
  'ort',
  'staat',
]);

/** Anschrift in eine Zeile; nur fuer die gaengigen Teile, sonst normal gegliedert. */
function anschriftZeile(el: Element, ebene: number, ctx: Kontext): UebersichtZeile | null {
  const k = kinder(el);
  if (!k.length || k.some((c) => !ANSCHRIFT_TEILE.has(c.localName))) return null;
  const v = (n: string) => {
    const c = k.find((x) => x.localName === n);
    return c && !istCode(c) ? text(c) : '';
  };
  const strasse = [v('strasse'), v('hausnummer')].filter(Boolean).join(' ');
  const ort = [v('postleitzahl'), v('ort')].filter(Boolean).join(' ');
  const zusatz: string[] = [];
  const staat = k.find((x) => x.localName === 'staat');
  if (staat) {
    const z = codeZeile(staat, 0, ctx);
    zusatz.push('Staat ' + z.wert + (z.zusatz ? ' ' + z.zusatz : ''));
  }
  const typ = k.find((x) => x.localName === 'anschriftstyp');
  if (typ) {
    const z = codeZeile(typ, 0, ctx);
    zusatz.push(z.zusatz ?? 'Typ ' + z.wert);
  }
  const wert = [strasse, ort].filter(Boolean).join(', ');
  if (!wert && !zusatz.length) return null;
  return {
    art: 'wert',
    ebene,
    name: 'Anschrift',
    wert: wert || '–',
    zusatz: zusatz.length ? zusatz.join(' · ') : undefined,
  };
}

/** Verweis-Blatt (`ref.sgo`, `ref.rollennummer`, …). */
function istRef(el: Element): boolean {
  return el.localName.startsWith('ref.') && !el.children.length;
}

/**
 * Ein Verweis als Zeile. Ein SGO-Verweis traegt die UUID des Ziels — die ist
 * fuer den Leser nichtssagend, darum steht dort das Dokument, wie es die
 * Uebersicht selbst nennt („Dokument 1 · Beschluss"); ein Ziel ausserhalb der
 * Nachricht bleibt als UUID stehen.
 */
function refZeile(ref: Element, name: string, ebene: number, ctx: Kontext): UebersichtZeile | null {
  const v = text(ref);
  if (!v) return null;
  if (!UUID.test(v)) return { art: 'wert', ebene, name, wert: formatiereWert(v) };
  const ziel = ctx.sgo.get(v.toLowerCase());
  if (!ziel) return { art: 'wert', ebene, name, wert: v, zusatz: 'nicht in dieser Nachricht' };
  return { art: 'wert', ebene, name, wert: ziel.titel, zusatz: ziel.anzeigename };
}

const SGO = new Set(['dokument', 'akte', 'teilakte']);

/** Alle Schriftgutobjekte mit Kennung, benannt wie ihre Gruppe in der Uebersicht. */
function sgoVerzeichnis(root: Element): Kontext['sgo'] {
  const out: Kontext['sgo'] = new Map();
  for (const el of Array.from(root.getElementsByTagName('*'))) {
    if (!SGO.has(el.localName)) continue;
    const ident = kinder(el).find((c) => c.localName === 'identifikation');
    const id = ident && kinder(ident).find((c) => c.localName === 'id');
    if (!id || !text(id)) continue;
    const gleiche = kinder(el.parentElement!).filter((c) => c.localName === el.localName);
    const titel =
      pretty(el.localName) + (gleiche.length > 1 ? ' ' + (gleiche.indexOf(el) + 1) : '');
    const fach = kinder(el).find((c) => c.localName === 'xjustiz.fachspezifischeDaten');
    const anz = [...kinder(el), ...(fach ? kinder(fach) : [])].find(
      (c) => c.localName === 'anzeigename',
    );
    out.set(text(id).toLowerCase(), { titel, anzeigename: (anz && text(anz)) || undefined });
  }
  return out;
}

function zeilenFuer(
  el: Element,
  ebene: number,
  ctx: Kontext,
  nummer: number | null,
): UebersichtZeile[] {
  const name = el.localName;
  if (TECHNISCH.has(name)) return [];
  if (istCode(el)) return [codeZeile(el, ebene, ctx)];
  const k = kinder(el);
  // Verweis-Traeger (bezugsdokument → ref.sgo): eine Zeile unter dem Namen des Traegers.
  const ref = k.length === 1 && istRef(k[0]!) ? k[0]! : !k.length && istRef(el) ? el : null;
  if (ref) {
    const z = refZeile(ref, pretty(name), ebene, ctx);
    return z ? [z] : [];
  }
  if (!k.length) {
    const v = text(el);
    if (!v || UUID.test(v)) return [];
    return [{ art: 'wert', ebene, name: pretty(name), wert: formatiereWert(v) }];
  }
  if (name === 'vollerName') {
    const z = nameZeile(el, ebene);
    if (z) return [z];
  }
  if (name === 'anschrift') {
    const z = anschriftZeile(el, ebene, ctx);
    if (z) return [z];
  }
  // Huellen: Auswahl, technische Container und (nicht nummerierte) Container,
  // die nur einen einzelnen Wert tragen (geburt → Geburtsdatum) — der Inhalt
  // steht ohne eigene Gruppe.
  const einzig = k.length === 1 ? k[0] : undefined;
  const nurEinWert = !!einzig && (!einzig.children.length || istCode(einzig));
  const huelle = nummer == null && (name.startsWith('auswahl_') || HUELLEN.has(name) || nurEinWert);
  const innen = huelle ? ebene : ebene + 1;
  const unter = kinderZeilen(el, innen, ctx);
  if (!unter.length || huelle) return unter;
  const titel = pretty(name) + (nummer != null ? ' ' + nummer : '');
  return [{ art: 'gruppe', ebene, name: titel }, ...unter];
}

/** Kinder in Dokumentreihenfolge; Wiederholungen werden durchnummeriert. */
function kinderZeilen(el: Element, ebene: number, ctx: Kontext): UebersichtZeile[] {
  const k = kinder(el);
  const anzahl = new Map<string, number>();
  for (const c of k) anzahl.set(c.localName, (anzahl.get(c.localName) ?? 0) + 1);
  const lauf = new Map<string, number>();
  const out: UebersichtZeile[] = [];
  for (const c of k) {
    let nr: number | null = null;
    if ((anzahl.get(c.localName) ?? 0) > 1) {
      nr = (lauf.get(c.localName) ?? 0) + 1;
      lauf.set(c.localName, nr);
    }
    out.push(...zeilenFuer(c, ebene, ctx, nr));
  }
  return out;
}

/** Leitet die Uebersicht aus dem XML einer Testnachricht ab; null bei unlesbarem XML. */
export function nachrichtUebersicht(
  xml: string,
  cb: CodeBezeichnung = () => null,
): NachrichtUebersicht | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length) return null;
  const kopf = kinder(root).find((c) => c.localName === 'nachrichtenkopf');
  const ctx: Kontext = { cb, sgo: sgoVerzeichnis(root) };
  const abschnitte: UebersichtAbschnitt[] = [];
  for (const haupt of kinder(root)) {
    const zeilen = kinderZeilen(haupt, 0, ctx);
    if (!zeilen.length && !text(haupt)) continue;
    abschnitte.push({
      titel: pretty(haupt.localName),
      zeilen: zeilen.length ? zeilen : zeilenFuer(haupt, 0, ctx, null),
    });
  }
  return {
    titel: pretty(root.localName),
    nachricht: root.localName,
    version: kopf?.getAttribute('xjustizVersion') ?? '',
    abschnitte,
  };
}
