import { Injectable, inject } from '@angular/core';
import { CodelistInfo, EnumWert } from '../../models/codelist.model';
import { kid, local } from '../util/xml.util';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';

/** Typgerechte Beispielwerte fuer Blaetter (XS_BUILTIN, Z.1997-2000). */
const XS_BUILTIN: Record<string, string> = {
  date: '2026-01-01', dateTime: '2026-01-01T12:00:00', time: '12:00:00',
  integer: '1', int: '1', nonNegativeInteger: '1', positiveInteger: '1', long: '1', decimal: '0.00',
  boolean: 'true', gYear: '2026', gYearMonth: '2026-01', anyURI: 'https://beispiel.example',
  token: 'Beispieltext', string: 'Beispieltext', normalizedString: 'Beispieltext',
  base64Binary: 'QmVpc3BpZWw=',
};

/** Ein Blatt-Knoten fuer die Platzhalter-Berechnung (Teilmenge von TreeNode). */
export interface PlaceholderNode {
  name: string;
  path: string;
  typeName: string | null;
  codelist: CodelistInfo | null;
}

/**
 * Werte-Helfer: effektive Codelisten-Werte und Beispiel-/Platzhalterwerte.
 * Portiert aus Profilierer.html (clWerte/clVersion Z.797-807, placeholderFor
 * Z.2001-2040).
 */
@Injectable({ providedIn: 'root' })
export class ValueService {
  private readonly state = inject(StateService);
  private readonly parser = inject(XsdParserService);

  /** clWerte (Z.797-802): inline gepflegte oder geladene Codelisten-Werte. */
  clWerte(cl: CodelistInfo | null): EnumWert[] | null {
    if (!cl) return null;
    if (cl.werte && cl.werte.length) return cl.werte;
    const x = this.state.codelists()[cl.kennung];
    return x && x.werte.length ? x.werte : null;
  }

  /** clVersion (Z.803-807): Version einer geladenen Codeliste. */
  clVersion(cl: CodelistInfo | null): string | null {
    if (!cl) return null;
    const x = this.state.codelists()[cl.kennung];
    return x ? x.version ?? null : null;
  }

  /** placeholderFor (Z.2001-2040): Beispielwert bzw. typgerechter Platzhalter. */
  placeholderFor(n: PlaceholderNode): string {
    const elemente = this.state.elemente();
    const p = elemente[n.path] ?? {};
    if (p.beispiel) return p.beispiel;

    // Verweis-Blatt: Nummer der Ziel-Auspraegung.
    if (/^ref\./.test(n.name)) {
      const parentPath = n.path.slice(0, n.path.lastIndexOf('/'));
      const rz = elemente[parentPath]?.refZiel || p.refZiel || null;
      if (rz) {
        const num = this.state.auspNumber(rz);
        if (num != null) return String(num);
      }
    }
    // Gegenstueck: Nummer der eigenen Auspraegung.
    if (n.name === 'rollennummer' || n.name === 'beteiligtennummer') {
      const lastAt = n.path.lastIndexOf('@');
      if (lastAt >= 0) {
        const end = n.path.indexOf('/', lastAt);
        const auspPath = end < 0 ? n.path : n.path.slice(0, end);
        const num = this.state.auspNumber(auspPath);
        if (num != null) return String(num);
      }
    }
    if (n.codelist) {
      if (p.werte && p.werte.length) return String(p.werte[0]).split(/\s+[—–-]\s+|\t/)[0]!.trim();
      const eff = this.clWerte(n.codelist);
      if (eff && eff.length) return eff[0]!.value;
      return 'CODE';
    }
    let t: string | null = n.typeName;
    const idx = this.state.idx();
    const seen = new Set<string>();
    while (t && !seen.has(t)) {
      seen.add(t);
      const builtin = XS_BUILTIN[t];
      if (builtin) return builtin;
      const st = idx ? idx.st[t] : undefined;
      if (st) {
        const en = this.parser.enumsOfST(st, idx!);
        if (en && en.length) return en[0]!.value;
        const r = kid(st, 'restriction');
        t = r ? local(r.getAttribute('base')) : null;
      } else t = null;
    }
    return 'Beispieltext';
  }
}
