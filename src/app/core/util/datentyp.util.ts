import { DatentypQuelle } from '../../models/profile.model';
import { XsdIndex } from '../../models/xsd-index.model';
import { appinfoOf, docOf } from './xml.util';
import { firstLine } from './pretty.util';

/**
 * **Datentyp-Katalog** einer Schema-Erweiterung (Issue #96).
 *
 * Der Typ einer Nachbeauftragung wird aus dem *geladenen* Schema-Index
 * abgeleitet, nicht aus einer gepflegten Liste — so passt die Auswahl
 * automatisch zur aktiven Schemaversion und zu Fremdschemata. Einzige
 * Ausnahme sind die XSD-Builtins: die sind nirgends deklariert und stehen
 * daher kuratiert hier.
 *
 * Gespeichert wird immer der **nackte Lokalname** (`datatypeC`,
 * `Type.GDS.Akte`, `string`); die Herkunft steht daneben in
 * `Erweiterung.datentypQuelle`.
 */

/**
 * Kuratierte xs:-Basistypen. Auswahl nach dem tatsaechlichen Schemagebrauch in
 * 3.6.2: `normalizedString` (277 Verwendungen), `positiveInteger` (57) und
 * `double` (45) sind aufgenommen, `gYear` faellt weg — es kommt im Schema
 * nirgends vor.
 */
export const XS_BASISTYPEN: ReadonlyArray<string> = [
  'string',
  'normalizedString',
  'token',
  'boolean',
  'date',
  'dateTime',
  'time',
  'anyURI',
  'integer',
  'positiveInteger',
  'decimal',
  'double',
  'base64Binary',
];

/** Die Zeichensatz-Datentypen der DIN 91379, in der Reihenfolge der Norm. */
const DIN_TYPEN: ReadonlyArray<string> = [
  'datatypeA',
  'datatypeB',
  'datatypeC',
  'datatypeD',
  'datatypeE',
];

/** Der DIN-Typ, mit dem eine neue Erweiterung vorbelegt wird. */
const DIN_VORGABE = 'datatypeC';

/** Praefix der fachlichen Typen im XJustiz-Schema. */
const TYPE_PRAEFIX = 'Type.';
/** Praefix der Codelisten-complexTypes. */
const CODE_PRAEFIX = 'Code.';

export const GRUPPE_SONSTIGES = 'Sonstiges';
export const GRUPPE_BASIS = 'Basistypen';
export const GRUPPE_DIN = 'DIN 91379';
export const GRUPPE_CODELISTEN = 'Codelisten';
/** Ueberschrift der fachlichen Typen eines Fachmoduls. */
export function gruppeFachlich(modul: string): string {
  return 'Fachliche Typen · ' + (modul || 'weitere');
}

/**
 * Art eines Listeneintrags: ein echter Typ oder einer der beiden
 * Sondereintraege (Container ohne Typ, Freitext fuer noch nicht Vorhandenes).
 */
export type DatentypArt = 'typ' | 'container' | 'frei';

export interface DatentypEintrag {
  art: DatentypArt;
  /** Lokalname, wie er in `Erweiterung.datentyp` landet; leer bei Sondereintraegen. */
  name: string;
  /** Herkunft; `null` beim Container (der hat gar keinen Typ). */
  quelle: DatentypQuelle | null;
  /** Anzeigetext (`xs:string`, `Type.GDS.Akte`, `datatypeC`). */
  label: string;
  /** Klartext daneben — auch Suchfeld. */
  info: string;
}

export interface DatentypGruppe {
  titel: string;
  eintraege: DatentypEintrag[];
}

/**
 * Der Typ-Anteil einer Schema-Erweiterung — das, was der Typwaehler liest und
 * schreibt. `Erweiterung` erfuellt die Form; so kennt der Waehler den Rest der
 * Erweiterung nicht.
 */
export interface DatentypWahl {
  datentyp?: string;
  datentypQuelle?: DatentypQuelle;
}

/** Beschriftung des Sondereintrags "Container" — auch die Anzeige ohne Datentyp. */
export const CONTAINER_LABEL = 'Container (enthält Unterelemente)';

/**
 * Herkunft eines gespeicherten Datentyps; `null` beim Container.
 *
 * Altbestand traegt das Feld nicht (keine Migration): dort galt genau ein
 * `xs:`-Basistyp aus der Auswahlliste oder ein Freitext aus dem Feld
 * „Sonstiger…" — diese Aufloesung bildet das nach.
 */
export function datentypQuelleOf(w: DatentypWahl): DatentypQuelle | null {
  if (!w.datentyp) return null;
  if (w.datentypQuelle) return w.datentypQuelle;
  return XS_BASISTYPEN.includes(w.datentyp) ? 'xs' : 'frei';
}

/** Anzeigetext eines gespeicherten Datentyps (`xs:string`, `Type.GDS.Akte`). */
export function datentypAnzeige(w: DatentypWahl): string {
  const quelle = datentypQuelleOf(w);
  if (!quelle) return CONTAINER_LABEL;
  return quelle === 'xs' ? 'xs:' + w.datentyp : w.datentyp!;
}

/**
 * Steht der Typ in keinem Katalog-Eintrag? Freitext bleibt erlaubt — eine
 * Nachbeauftragung kann einen Typ meinen, den es noch nicht gibt —, wird aber
 * markiert, damit ein Tippfehler auffaellt. Der Abgleich laeuft ueber den
 * Namen, nicht ueber die Herkunft: ein Altbestands-Eintrag ohne Herkunft gilt
 * zwar als Freitext, kann den Typ aber sehr wohl treffen.
 */
export function datentypUnbekannt(w: DatentypWahl, katalog: DatentypGruppe[]): boolean {
  if (datentypQuelleOf(w) !== 'frei') return false;
  return !katalog.some((g) => g.eintraege.some((e) => e.art === 'typ' && e.name === w.datentyp));
}

/** `nameLang` aus dem appinfo eines Typs (`datentyp` bzw. `codeliste`). */
function nameLangOf(el: Element): string {
  const ai = appinfoOf(el);
  const n = ai?.getElementsByTagName('nameLang')[0];
  return (n?.textContent ?? '').trim();
}

/** Klartext eines Schematyps: bevorzugt die gepflegte Bezeichnung, sonst die Doku. */
function klartext(el: Element): string {
  return nameLangOf(el) || firstLine(docOf(el));
}

function typEintrag(name: string, el: Element, info?: string): DatentypEintrag {
  return { art: 'typ', name, quelle: 'schema', label: name, info: info ?? klartext(el) };
}

/** Sortiert Typnamen stabil fuer die Anzeige. */
function sortiert(namen: Iterable<string>): string[] {
  return [...namen].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Der vollstaendige Katalog: Sondereintraege, kuratierte Basistypen und alles,
 * was der Index an waehlbaren Typen hergibt.
 *
 * Bewusst **nicht** aufgenommen sind die Codelisten-simpleTypes
 * (`gds.aktentyp` und ~140 weitere): das sind die internen Restriktionen hinter
 * den `Code.*`-complexTypes — ein Element bekommt in XJustiz immer den
 * complexType.
 */
export function datentypGruppen(idx: XsdIndex | null): DatentypGruppe[] {
  const gruppen: DatentypGruppe[] = [
    {
      titel: GRUPPE_SONSTIGES,
      eintraege: [
        {
          art: 'container',
          name: '',
          quelle: null,
          label: 'Container (enthält Unterelemente)',
          info: 'Das Element trägt keinen eigenen Wert, sondern Unterelemente.',
        },
        {
          art: 'frei',
          name: '',
          quelle: 'frei',
          label: 'Sonstiger… (Freitext)',
          info: 'Typ, den es im Schema noch nicht gibt.',
        },
      ],
    },
    {
      titel: GRUPPE_BASIS,
      eintraege: XS_BASISTYPEN.map((n) => ({
        art: 'typ' as const,
        name: n,
        quelle: 'xs' as const,
        label: 'xs:' + n,
        info: '',
      })),
    },
  ];
  if (!idx) return gruppen;

  const din = DIN_TYPEN.filter((n) => idx.st[n]).map((n) => {
    const el = idx.st[n]!;
    const kt = klartext(el);
    return typEintrag(n, el, kt ? kt + ' (DIN 91379)' : GRUPPE_DIN);
  });
  if (din.length) gruppen.push({ titel: GRUPPE_DIN, eintraege: din });

  // Fachliche Typen stehen mal als complexType, mal als simpleType im Schema —
  // fuer die Auswahl ist das derselbe Fall. Der complexType hat Vorrang.
  const fachlich = new Map<string, Element>();
  for (const quelle of [idx.ct, idx.st])
    for (const [n, el] of Object.entries(quelle))
      if (n.startsWith(TYPE_PRAEFIX) && !fachlich.has(n)) fachlich.set(n, el);

  const module = new Map<string, DatentypEintrag[]>();
  for (const n of sortiert(fachlich.keys())) {
    const modul = n.split('.')[1] ?? '';
    const liste = module.get(modul);
    const eintrag = typEintrag(n, fachlich.get(n)!);
    if (liste) liste.push(eintrag);
    else module.set(modul, [eintrag]);
  }
  for (const modul of sortiert(module.keys()))
    gruppen.push({ titel: gruppeFachlich(modul), eintraege: module.get(modul)! });

  const codes = sortiert(Object.keys(idx.ct).filter((n) => n.startsWith(CODE_PRAEFIX)));
  if (codes.length)
    gruppen.push({
      titel: GRUPPE_CODELISTEN,
      eintraege: codes.map((n) => typEintrag(n, idx.ct[n]!)),
    });

  return gruppen;
}

/**
 * Der Suchkatalog der zentralen Suche: alles, was sich als eigener Baum
 * ansehen laesst — die fachlichen `Type.*` (complexType vor simpleType) und
 * die Codelisten-`Code.*`. Ohne Sondereintraege, ohne xs:-Basistypen und ohne
 * die DIN-Typen: die tragen keine Struktur, die eine Ansicht lohnte.
 */
export function suchTypen(idx: XsdIndex | null): DatentypEintrag[] {
  if (!idx) return [];
  const gefunden = new Map<string, Element>();
  for (const [n, el] of Object.entries(idx.ct))
    if (n.startsWith(TYPE_PRAEFIX) || n.startsWith(CODE_PRAEFIX)) gefunden.set(n, el);
  for (const [n, el] of Object.entries(idx.st))
    if (n.startsWith(TYPE_PRAEFIX) && !gefunden.has(n)) gefunden.set(n, el);
  return sortiert(gefunden.keys()).map((n) => typEintrag(n, gefunden.get(n)!));
}

/**
 * Freitextsuche ueber den Katalog: Typname **und** Klartext, wie im
 * Nachrichtenwaehler. Leergefilterte Gruppen fallen weg, damit keine
 * Ueberschrift ohne Inhalt stehen bleibt.
 *
 * Der Eintrag „Sonstiger…" ueberlebt jeden Filter: gesucht wird ein Typ, den
 * es im Schema **nicht** gibt, genau dann kommt „keine Treffer" — und genau
 * dann braucht man den Freitext. Ihn wegzufiltern zwaenge zum Umweg
 * Suche leeren → Freitext waehlen → Namen ein zweites Mal tippen.
 */
export function filterGruppen(gruppen: DatentypGruppe[], suche: string): DatentypGruppe[] {
  const q = suche.trim().toLowerCase();
  if (!q) return gruppen;
  const passt = (e: DatentypEintrag): boolean =>
    e.art === 'frei' || e.label.toLowerCase().includes(q) || e.info.toLowerCase().includes(q);
  return gruppen
    .map((g) => ({ titel: g.titel, eintraege: g.eintraege.filter(passt) }))
    .filter((g) => g.eintraege.length > 0);
}

/**
 * Vorbelegter Datentyp einer neuen Schema-Erweiterung (#96): `datatypeC` der
 * DIN 91379 — mit 907 Verwendungen der haeufigste Typ in 3.6.2 ueberhaupt.
 * Vorher stand hier `xs:string`, was den Schemagebrauch nicht traf.
 */
export const ERW_TYP_VORGABE: DatentypWahl = { datentyp: 'datatypeC', datentypQuelle: 'schema' };
/** Rueckfall, wenn das geladene Schema `datatypeC` nicht kennt (Fremdschema). */
export const ERW_TYP_RUECKFALL: DatentypWahl = { datentyp: 'string', datentypQuelle: 'xs' };

/**
 * Vorbelegung einer neuen Erweiterung. `datatypeC` gilt nur, wenn das geladene
 * Schema die DIN-91379-Typen ueberhaupt mitbringt — sonst entstuende bei einem
 * Fremdschema eine Erweiterung, deren Typ nirgends aufloest und die damit
 * sofort im Warnzustand steht.
 */
export function erwTypVorgabe(idx: XsdIndex | null): DatentypWahl {
  return idx?.st[DIN_VORGABE] ? { ...ERW_TYP_VORGABE } : { ...ERW_TYP_RUECKFALL };
}
