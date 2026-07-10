/**
 * Reine, zustandslose XML-/String-Helfer. Portiert aus Profilierer.html
 * (Z.338-345, 947, 1503). Der XML-Schema-Namespace ist fest.
 */
export const XS = 'http://www.w3.org/2001/XMLSchema';
export const XJNS = 'http://www.xjustiz.de';

/** Alle direkten XS-Kinder mit lokalem Namen `ln` (kids, Z.338). */
export function kids(el: Element, ln: string): Element[] {
  const r: Element[] = [];
  for (const c of Array.from(el.children)) {
    if (c.namespaceURI === XS && c.localName === ln) r.push(c);
  }
  return r;
}

/** Erstes direktes XS-Kind mit lokalem Namen `ln` (kid, Z.339). */
export function kid(el: Element, ln: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.namespaceURI === XS && c.localName === ln) return c;
  }
  return null;
}

/** Lokaler Teil eines evtl. praefixierten Namens (local, Z.340). */
export function local(n: string | null): string | null {
  return n ? n.split(':').pop()! : null;
}

/** Dokumentation eines Elements aus annotation/documentation (docOf, Z.341-344). */
export function docOf(el: Element | null): string {
  if (!el) return '';
  const a = kid(el, 'annotation');
  if (!a) return '';
  return kids(a, 'documentation')
    .map((d) => (d.textContent ?? '').trim())
    .join('\n');
}

/** appinfo-Element aus der annotation (appinfoOf, Z.345). */
export function appinfoOf(el: Element): Element | null {
  const a = kid(el, 'annotation');
  return a ? kid(a, 'appinfo') : null;
}

/** HTML-Escaping fuer Textinhalte (esc, Z.1503). */
export function esc(s: unknown): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return String(s ?? '').replace(/[&<>"]/g, (c) => map[c]!);
}

/** Escaping fuer regulaere Ausdruecke (escapeRegExp, Z.947). */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
