/**
 * Reine Anzeige-Ableitungen fuer Namen und Kardinalitaeten. Portiert aus
 * Profilierer.html (Z.557-579). `valueKind` ist schema-abhaengig und liegt
 * daher im XsdParserService (P2), nicht hier.
 */

/** Menschenlesbarer Anzeigename eines technischen Elementnamens (pretty, Z.557-568). */
export function pretty(name: string): string {
  if (/^nachricht\./.test(name)) {
    const p = name.split('.');
    return p
      .slice(1, -1)
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(' — ');
  }
  let s = name;
  let prefix = '';
  if (s.startsWith('auswahl_')) {
    prefix = 'Auswahl: ';
    s = s.slice(8);
  }
  if (s.startsWith('ref.')) {
    prefix = 'Verweis: ';
    s = s.slice(4);
  }
  s = s
    .replace(/[._]/g, ' ')
    .replace(/([a-zäöüß0-9])([A-ZÄÖÜ])/g, '$1 $2')
    .trim();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return prefix + s;
}

/** Kardinalitaet als Klartext (kardText, Z.569-578). */
export function kardText(min: string, max: string): string {
  const mx = max === 'unbounded' || max === '*' ? Infinity : parseInt(max);
  const mn = parseInt(min);
  if (mn === 1 && mx === 1) return 'genau 1';
  if (mn === 0 && mx === 1) return '0 oder 1';
  if (mn === 0 && mx === Infinity) return 'beliebig viele';
  if (mn === 1 && mx === Infinity) return 'mindestens 1, mehrfach';
  if (mn === mx) return 'genau ' + mn;
  return mn + ' bis ' + (mx === Infinity ? 'beliebig' : mx);
}

/** Kompakte Kardinalitaet wie "0..*" oder "1" (fmtKard, Z.579). */
export function fmtKard(min: string, max: string): string {
  const mx = max === 'unbounded' ? '*' : max;
  return min === '1' && mx === '1' ? '1' : min + '..' + mx;
}

/** Erste Zeile eines mehrzeiligen Texts (Kachel-/Listen-Anzeige von Doku/Notizen). */
export function firstLine(s: string): string {
  return s.split('\n')[0]!;
}

/**
 * Zerlegt einen Nachrichtennamen fuer die Anzeige auf Kacheln in Kopf und
 * Ende (Issue #88/#91): `nachricht.enova.entscheidung` + `.2900003`.
 *
 * Beide Uebersichten kuerzen den Namen in der **Mitte** — CSS kann nur am Ende
 * kuerzen, dort steht aber die Nummer, an der die Nachricht wiedererkannt wird.
 * Der Kopf schrumpft per `text-overflow`, das Ende bleibt stehen.
 */
export function nachrichtTeile(name: string | null | undefined): { kopf: string; ende: string } {
  const n = name ?? '';
  const i = n.lastIndexOf('.');
  return i > 0 ? { kopf: n.slice(0, i), ende: n.slice(i) } : { kopf: n, ende: '' };
}
