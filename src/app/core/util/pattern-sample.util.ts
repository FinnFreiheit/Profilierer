/**
 * Pattern-konforme Beispielwerte: XSD-simpleTypes mit `xs:pattern`-Facette
 * (z. B. Type.GDS.Datumsangabe, UUID-Typen) bekommen sonst typwidrige
 * Platzhalter wie "Beispieltext". Hier wird ein Wert gewaehlt bzw. aus dem
 * Pattern erzeugt, der die Facette tatsaechlich erfuellt.
 */

/**
 * XSD-Pattern anchored als JS-RegExp kompilieren; null wenn nicht abbildbar.
 * Memoisiert — placeholderFor laeuft pro sichtbarem Blatt, und die
 * DIN-91379-Zeichenrepertoire-Patterns sind mehrere KB gross.
 */
const compiled = new Map<string, RegExp | null>();
export function compileXsdPattern(pattern: string): RegExp | null {
  if (compiled.has(pattern)) return compiled.get(pattern)!;
  let rx: RegExp | null = null;
  for (const flags of ['u', ''] as const) {
    try {
      rx = new RegExp('^(?:' + pattern + ')$', flags);
      break;
    } catch {
      /* naechster Versuch bzw. null */
    }
  }
  compiled.set(pattern, rx);
  return rx;
}

/**
 * Beispielwert zu einer Pattern-Facette (mehrere Patterns = Alternativen,
 * XSD-Semantik). Reihenfolge: `fallback` behalten, wenn er schon passt;
 * sonst der erste passende `kandidaten`-Wert (typische schoene Werte wie
 * "2026-01-01"); sonst ein aus dem Pattern generierter Wert; zuletzt der
 * Fallback unveraendert. Nicht kompilierbare Patterns werden ignoriert.
 */
export function konformerBeispielwert(patterns: string[], kandidaten: string[], fallback: string): string {
  const rx = patterns.map(compileXsdPattern).filter((r): r is RegExp => !!r);
  if (!rx.length) return fallback;
  const passt = (s: string) => rx.some((r) => r.test(s));
  if (passt(fallback)) return fallback;
  for (const k of kandidaten) if (passt(k)) return k;
  for (const p of patterns) {
    const g = sampleFromPattern(p);
    if (g !== null && passt(g)) return g;
  }
  return fallback;
}

/**
 * Erzeugt einen zum Pattern passenden Beispielstring (best effort, null bei
 * nicht unterstuetzter Syntax). Alternativen: erster Zweig; Quantoren: obere
 * Grenze, wenn endlich und klein (damit optionale Teile wie "-01" in
 * Datums-Patterns sichtbar werden), sonst die untere (mindestens 1).
 */
export function sampleFromPattern(pattern: string): string | null {
  try {
    const g = new PatternGenerator(pattern);
    const s = g.alternation();
    return g.done() ? s : null;
  } catch {
    return null;
  }
}

/** Vorzugszeichen fuer Zeichenklassen — gut lesbare Werte zuerst. */
const CLASS_PREFERENCE = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-+.,:/ _';

class PatternGenerator {
  private i = 0;
  private readonly src: string;
  constructor(src: string) {
    this.src = src;
  }

  done(): boolean {
    return this.i >= this.src.length;
  }

  alternation(): string {
    // Nur der erste Zweig wird erzeugt; die restlichen Zweige werden
    // syntaktisch ueberlesen, damit Gruppen korrekt schliessen.
    const first = this.sequence();
    while (this.peek() === '|') {
      this.i++;
      this.sequence();
    }
    return first;
  }

  private sequence(): string {
    let out = '';
    while (!this.done() && this.peek() !== '|' && this.peek() !== ')') {
      out += this.piece();
    }
    return out;
  }

  private piece(): string {
    const atom = this.atom();
    const [min, max] = this.quantifier();
    // Endliche kleine Obergrenze bevorzugen (optionale Teile zeigen),
    // sonst Untergrenze, mindestens 1 Wiederholung.
    const reps = max !== Infinity && max <= 12 ? max : Math.max(min, 1);
    return atom.repeat(Math.max(reps, min));
  }

  private atom(): string {
    const c = this.src[this.i];
    if (c === undefined) throw new Error('unerwartetes Ende');
    if (c === '(') {
      this.i++;
      // Nicht-fangende Gruppen (?:...) tolerieren.
      if (this.peek() === '?' && this.src[this.i + 1] === ':') this.i += 2;
      const inner = this.alternation();
      if (this.peek() !== ')') throw new Error('Gruppe nicht geschlossen');
      this.i++;
      return inner;
    }
    if (c === '[') return this.charClass();
    if (c === '\\') return this.escape();
    if (c === '.') {
      this.i++;
      return 'a';
    }
    if ('?*+{)'.includes(c)) throw new Error('unerwarteter Quantor');
    this.i++;
    return c;
  }

  private escape(): string {
    this.i++; // '\'
    const c = this.src[this.i];
    if (c === undefined) throw new Error('unerwartetes Ende nach \\');
    this.i++;
    switch (c) {
      case 'd': return '1';
      case 'D': return 'A';
      case 'w': return 'a';
      case 'W': return '-';
      case 's': return ' ';
      case 'S': return 'a';
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'p': case 'P': {
        // \p{L} etc.: Kategorie ueberlesen, Buchstabe als Naeherung.
        if (this.peek() === '{') {
          const end = this.src.indexOf('}', this.i);
          if (end < 0) throw new Error('\\p ohne }');
          this.i = end + 1;
        }
        return c === 'p' ? 'a' : '-';
      }
      default: return c; // \- \. \\ usw. woertlich
    }
  }

  /** Zeichenklasse: erstes bevorzugtes Mitglied; bei Negation erstes Nicht-Mitglied. */
  private charClass(): string {
    this.i++; // '['
    const negated = this.peek() === '^';
    if (negated) this.i++;
    const members = new Set<string>();
    const ranges: [string, string][] = [];
    let first = true;
    while (this.peek() !== ']' || first) {
      if (this.done()) throw new Error('Klasse nicht geschlossen');
      first = false;
      let c = this.src[this.i]!;
      if (c === '\\') {
        const e = this.escape();
        // Kurzklassen in der Klasse: repraesentative Zeichen aufnehmen.
        if (e === '1') for (const d of '0123456789') members.add(d);
        else members.add(e);
        continue;
      }
      this.i++;
      if (this.peek() === '-' && this.src[this.i + 1] !== ']' && this.src[this.i + 1] !== undefined) {
        this.i++;
        let hi = this.src[this.i]!;
        if (hi === '\\') hi = this.escape();
        else this.i++;
        ranges.push([c, hi]);
      } else members.add(c);
    }
    this.i++; // ']'
    const inClass = (ch: string) =>
      members.has(ch) || ranges.some(([lo, hi]) => ch >= lo && ch <= hi);
    for (const ch of CLASS_PREFERENCE) {
      if (negated ? !inClass(ch) : inClass(ch)) return ch;
    }
    if (!negated) {
      if (ranges.length) return ranges[0]![0];
      const it = members.values().next();
      if (!it.done) return it.value;
    }
    throw new Error('kein Klassen-Beispielzeichen');
  }

  private quantifier(): [number, number] {
    const c = this.peek();
    if (c === '?') { this.i++; return [0, 1]; }
    if (c === '*') { this.i++; return [0, Infinity]; }
    if (c === '+') { this.i++; return [1, Infinity]; }
    if (c === '{') {
      const end = this.src.indexOf('}', this.i);
      if (end < 0) throw new Error('{ ohne }');
      const body = this.src.slice(this.i + 1, end);
      const m = /^(\d+)(,(\d*)?)?$/.exec(body);
      if (!m) throw new Error('ungueltiger Quantor');
      this.i = end + 1;
      const min = parseInt(m[1]!, 10);
      const max = m[2] === undefined ? min : m[3] ? parseInt(m[3], 10) : Infinity;
      return [min, max];
    }
    return [1, 1];
  }

  private peek(): string | undefined {
    return this.src[this.i];
  }
}
