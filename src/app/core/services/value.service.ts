import { Injectable, inject } from '@angular/core';
import { CodelistInfo, EnumWert } from '../../models/codelist.model';
import { kid, kids, local } from '../util/xml.util';
import { konformerBeispielwert } from '../util/pattern-sample.util';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';

/** Typgerechte Beispielwerte fuer Blaetter (XS_BUILTIN, Z.1997-2000). */
const XS_BUILTIN: Record<string, string> = {
  date: '2026-01-01', dateTime: '2026-01-01T12:00:00', time: '12:00:00',
  integer: '1', int: '1', nonNegativeInteger: '1', positiveInteger: '1', long: '1', decimal: '0.00',
  double: '0.0', float: '0.0', short: '1', byte: '1',
  unsignedLong: '1', unsignedInt: '1', unsignedShort: '1', unsignedByte: '1',
  negativeInteger: '-1', nonPositiveInteger: '0', duration: 'P1D',
  boolean: 'true', gYear: '2026', gYearMonth: '2026-01', gMonthDay: '--01-01',
  gDay: '---01', gMonth: '--01', anyURI: 'https://beispiel.example', language: 'de',
  token: 'Beispieltext', string: 'Beispieltext', normalizedString: 'Beispieltext',
  base64Binary: 'QmVpc3BpZWw=', hexBinary: '0F',
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

  /**
   * labelFor: Klartext-Bezeichnung hinter einem konkret belegten Code.
   * Liefert null, wenn keine (geladene) Codeliste vorliegt oder der Code dort
   * nicht enthalten ist — der rohe Code bleibt dann die einzige Darstellung.
   */
  labelFor(cl: CodelistInfo | null, code: string | null | undefined): string | null {
    if (!cl || !code) return null;
    const eff = this.clWerte(cl);
    if (!eff) return null;
    const hit = eff.find((w) => w.value === code);
    return hit && hit.label ? hit.label : null;
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
    // Erste Pattern-Facette der Restriktions-Kette (spezifischster Typ zuerst);
    // mehrere xs:pattern im selben Schritt sind XSD-seitig Alternativen.
    let patterns: string[] | null = null;
    let sample = 'Beispieltext';
    while (t && !seen.has(t)) {
      seen.add(t);
      const builtin = XS_BUILTIN[t];
      if (builtin) {
        sample = builtin;
        break;
      }
      const st = idx ? idx.st[t] : undefined;
      if (st) {
        const en = this.parser.enumsOfST(st, idx!);
        if (en && en.length) return en[0]!.value;
        const r = kid(st, 'restriction');
        if (r && !patterns) {
          const ps = kids(r, 'pattern')
            .map((p) => p.getAttribute('value'))
            .filter((v): v is string => !!v);
          if (ps.length) patterns = ps;
        }
        t = r ? local(r.getAttribute('base')) : null;
      } else t = null;
    }
    // Datentyp-Facette einhalten: Wert an der Pattern-Restriktion ausrichten
    // (z. B. Type.GDS.Datumsangabe, UUID-Typen).
    if (patterns) return konformerBeispielwert(patterns, Object.values(XS_BUILTIN), sample);
    return sample;
  }
}
