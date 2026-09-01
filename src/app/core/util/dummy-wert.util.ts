/**
 * Semantische Dummy-Werte: Blaetter, deren Name eine fachliche Bedeutung
 * verraet (vorname, ort, aktenzeichen, iban …), bekommen statt "Beispieltext"
 * einen Wert, der wie echte Testdaten liest. Deterministisch (erster Eintrag
 * des Pools) fuer Platzhalter und Export — dieselbe Anzeige bei jedem Render —,
 * per `zufall` gewuerfelt fuer den Wuerfel-Button und die Sammelbefuellung.
 */

/** Ein Wert aus dem Pool: der erste (stabil) oder ein zufaelliger. */
function aus(pool: readonly string[], zufall: boolean): string {
  return zufall ? pool[Math.floor(Math.random() * pool.length)]! : pool[0]!;
}

function zahl(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const VORNAMEN = ['Erika', 'Max', 'Miriam', 'Jonas', 'Leyla', 'Paul', 'Sofia', 'Karl'];
const NACHNAMEN = [
  'Mustermann',
  'Musterfrau',
  'Müller',
  'Schmidt',
  'Weber',
  'Fischer',
  'Becker',
  'Yilmaz',
];
const VOLLNAMEN = [
  'Erika Mustermann',
  'Max Mustermann',
  'Miriam Weber',
  'Jonas Schmidt',
  'Leyla Yilmaz',
];
const ORTE = ['Musterstadt', 'Berlin', 'Hamburg', 'Köln', 'Leipzig', 'Bremen', 'Stuttgart'];
const STRASSEN = [
  'Musterstraße',
  'Hauptstraße',
  'Bahnhofstraße',
  'Gartenweg',
  'Lindenallee',
  'Amtsgerichtsplatz',
];
const HAUSNUMMERN = ['12', '7', '128a', '3b', '45', '9'];
const PLZ = ['12345', '10115', '20095', '50667', '04109', '28195'];
const AKTENZEICHEN = ['12 C 345/26', '4 O 123/26', '7 K 89/25', '302 Js 1745/26', '9 T 56/26'];
const FIRMEN = ['Muster GmbH', 'Beispiel AG', 'Kanzlei Meier und Partner', 'Muster und Sohn KG'];
const BERUFE = ['Kauffrau', 'Ingenieur', 'Lehrerin', 'Tischler', 'Rechtsanwältin'];
const IBANS = ['DE02120300000000202051', 'DE89370400440532013000', 'DE75512108001245126199'];
const BICS = ['MARKDEF1100', 'DEUTDEFFXXX', 'GENODEF1M04'];
const BANKEN = ['Sparkasse Musterstadt', 'Volksbank Musterstadt', 'Musterbank AG'];
const TITEL = ['Dr.', 'Prof. Dr.', 'Dr. h.c.'];
const DATEINAMEN = ['schriftsatz.pdf', 'anlage_k1.pdf', 'klageschrift.pdf', 'urteil.pdf'];
const VERWENDUNGSZWECKE = [
  'Gerichtskostenvorschuss',
  'Kostenrechnung 4711',
  'Auslagen Sachverständiger',
];
const SAETZE = [
  'Zur Prüfung vorgelegt.',
  'Ohne besondere Vorkommnisse.',
  'Weitere Unterlagen folgen.',
  'Siehe beigefügtes Dokument.',
];
const KENNZEICHEN = ['B-MW 1234', 'M-XY 987', 'HH-AB 42'];
const TELEFONNUMMERN = ['+49 30 12345678', '+49 40 9876543', '+49 89 5551234'];
const EMAILS = ['erika.mustermann@beispiel.example', 'max.mustermann@beispiel.example'];

/**
 * Namensregeln, erste Treffer gewinnt. Bewusst eng gefasst (Anker statt
 * blosser Teilstrings), damit z. B. `antwortID` nicht als „ort" gelesen wird.
 */
const REGELN: readonly [RegExp, readonly string[]][] = [
  [/vorname|rufname/, VORNAMEN],
  [/dateiname/, DATEINAMEN],
  [/anzeigename|vollername|karteninhaber|kontoinhaber|urkundsperson/, VOLLNAMEN],
  [/nachname|geburtsname|familienname|^name($|[.])/, NACHNAMEN],
  [/firma|kanzlei/, FIRMEN],
  [/geburtsort|sterbeort|gerichtsort|wohnort|^ort($|[.s])/, ORTE],
  [/strasse/, STRASSEN],
  [/hausnummer/, HAUSNUMMERN],
  [/postleitzahl/, PLZ],
  [/aktenzeichen|geschaeftszeichen|verfahrensnummer/, AKTENZEICHEN],
  [/iban/, IBANS],
  [/^bic$/, BICS],
  [/^bank$/, BANKEN],
  [/beruf/, BERUFE],
  [/^titel$/, TITEL],
  [/verwendungszweck/, VERWENDUNGSZWECKE],
  [/beschreibung|bemerkung|anmerkung|notiz|^grund($|[.])/, SAETZE],
  [/^kennzeichen$/, KENNZEICHEN],
  [/telefon|telefax|mobil/, TELEFONNUMMERN],
  [/e-?mail/, EMAILS],
];

/** Builtins, deren Wert freier Text ist — nur dort greifen die Namensregeln. */
const TEXT_BUILTINS = new Set(['string', 'token', 'normalizedString']);

function zufallsDatum(vonJahr: number, bisJahr: number): string {
  return `${zahl(vonJahr, bisJahr)}-${pad(zahl(1, 12))}-${pad(zahl(1, 28))}`;
}

function zufallsUhrzeit(): string {
  return `${pad(zahl(0, 23))}:${pad(zahl(0, 59))}:${pad(zahl(0, 59))}`;
}

/**
 * Semantischer bzw. gewuerfelter Kandidat fuer ein Blatt — null heisst: kein
 * besserer Wert bekannt, der XS_BUILTIN-Standard bleibt. Der Kandidat ist nur
 * ein Vorschlag; ob er eine Pattern-Facette erfuellt, prueft der Aufrufer.
 */
export function dummyKandidat(
  name: string,
  builtin: string | null,
  zufall: boolean,
): string | null {
  const n = name.toLowerCase();
  // Geburtsdatum auch ohne Wuerfeln in der Vergangenheit — "geboren 2026"
  // liest sich in jeder Testnachricht falsch.
  if (/geburtsdatum/.test(n)) return zufall ? zufallsDatum(1950, 2005) : '1980-05-12';
  if (builtin === null || TEXT_BUILTINS.has(builtin)) {
    // Datums-/Uhrzeitfelder sind in XJustiz oft pattern-eingeschraenkte
    // Strings (Type.GDS.Datumsangabe) — hier verraet der Name die Bedeutung.
    // Ob der Wert die Facette wirklich erfuellt, prueft der Aufrufer.
    if (/uhrzeit/.test(n)) return zufall ? zufallsUhrzeit() : null;
    if (/datum/.test(n)) return zufall ? zufallsDatum(2024, 2026) : null;
    for (const [rx, pool] of REGELN) if (rx.test(n)) return aus(pool, zufall);
    // Unbekanntes Textfeld: nur beim Wuerfeln variieren, damit „nochmal
    // wuerfeln" den Wert sichtbar aendert.
    return zufall ? `Beispieltext ${zahl(1, 99)}` : null;
  }
  if (!zufall) return null;
  switch (builtin) {
    case 'date':
      return zufallsDatum(2024, 2026);
    case 'dateTime':
      return `${zufallsDatum(2024, 2026)}T${zufallsUhrzeit()}`;
    case 'time':
      return zufallsUhrzeit();
    case 'gYear':
      return String(zahl(2015, 2026));
    case 'gYearMonth':
      return `${zahl(2015, 2026)}-${pad(zahl(1, 12))}`;
    case 'integer':
    case 'int':
    case 'long':
    case 'short':
    case 'byte':
    case 'nonNegativeInteger':
    case 'positiveInteger':
    case 'unsignedLong':
    case 'unsignedInt':
    case 'unsignedShort':
    case 'unsignedByte':
      return String(zahl(1, 99));
    case 'negativeInteger':
      return String(-zahl(1, 99));
    case 'decimal':
      return `${zahl(1, 999)}.${pad(zahl(0, 99))}`;
    case 'double':
    case 'float':
      return `${zahl(0, 99)}.${zahl(0, 9)}`;
    case 'boolean':
      return Math.random() < 0.5 ? 'true' : 'false';
    case 'duration':
      return `P${zahl(1, 30)}D`;
    default:
      return null;
  }
}
