import { Injectable, inject } from '@angular/core';
import { CodelistInfo, EnumWert } from '../../models/codelist.model';
import { kid, kids, local } from '../util/xml.util';
import { compileXsdPattern, konformerBeispielwert } from '../util/pattern-sample.util';
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

/** Format-Pruefungen fuer eingegebene Werte der gaengigen Builtins (lexikalischer Raum, vereinfacht). */
const XS_CHECK: Record<string, RegExp> = {
  date: /^-?\d{4,}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/,
  dateTime: /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
  time: /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
  integer: /^[+-]?\d+$/, int: /^[+-]?\d+$/, long: /^[+-]?\d+$/, short: /^[+-]?\d+$/, byte: /^[+-]?\d+$/,
  nonNegativeInteger: /^\+?\d+$/, positiveInteger: /^\+?0*[1-9]\d*$/,
  negativeInteger: /^-0*[1-9]\d*$/, nonPositiveInteger: /^(-\d+|\+?0+)$/,
  unsignedLong: /^\+?\d+$/, unsignedInt: /^\+?\d+$/, unsignedShort: /^\+?\d+$/, unsignedByte: /^\+?\d+$/,
  decimal: /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
  double: /^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|-?INF|NaN)$/,
  float: /^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|-?INF|NaN)$/,
  boolean: /^(true|false|0|1)$/,
  gYear: /^-?\d{4,}$/, gYearMonth: /^-?\d{4,}-\d{2}$/,
  gMonthDay: /^--\d{2}-\d{2}$/, gDay: /^---\d{2}$/, gMonth: /^--\d{2}$/,
  duration: /^-?P(?=.)(\d+Y)?(\d+M)?(\d+D)?(T(?=.)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/,
  hexBinary: /^([0-9A-Fa-f]{2})*$/,
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

  /**
   * clVersion (Z.803-807): Version einer Codeliste. Die im XSD fixierte
   * `listVersionID` hat Vorrang — nur sie besteht die Schemavalidierung;
   * sonst die Version der aus dem XRepository geladenen Liste.
   */
  clVersion(cl: CodelistInfo | null): string | null {
    if (!cl) return null;
    if (cl.version) return cl.version;
    const x = this.state.codelists()[cl.kennung];
    return x ? x.version ?? null : null;
  }

  /** placeholderFor (Z.2001-2040): Beispielwert bzw. typgerechter Platzhalter. */
  placeholderFor(n: PlaceholderNode): string {
    const p = this.state.elemente()[n.path] ?? {};
    if (p.beispiel) return p.beispiel;
    return this.dummyFor(n);
  }

  /**
   * Typkonformer Dummy-Wert, unabhaengig von einem evtl. gesetzten Beispielwert
   * — fuer den "Wuerfel"-Button und das globale Befuellen offener Pflichtfelder
   * (US "Testnachricht gefuehrt erstellen"). UUID-Facetten bekommen eine echte
   * Zufalls-UUID, sonst gilt die Platzhalter-Logik (Codeliste, Enumeration,
   * Pattern-Facette, Builtin).
   */
  dummyFor(n: PlaceholderNode): string {
    const elemente = this.state.elemente();
    const p = elemente[n.path] ?? {};

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
    const res = this.resolveType(n.typeName);
    if (res.enumWerte && res.enumWerte.length) return res.enumWerte[0]!.value;
    const sample = res.builtin ? XS_BUILTIN[res.builtin]! : 'Beispieltext';
    // Datentyp-Facette einhalten: Wert an der Pattern-Restriktion ausrichten
    // (z. B. Type.GDS.Datumsangabe, UUID-Typen).
    if (res.patterns) {
      // Echte Zufalls-UUID, wenn erst die UUID die Facette erfuellt (z. B.
      // eigeneNachrichtenID) — nicht bei permissiven Text-Patterns, die schon
      // die freundlichen Kandidaten zulassen.
      const rxs = res.patterns.map(compileXsdPattern).filter((r): r is RegExp => !!r);
      const passt = (s: string): boolean => rxs.some((r) => r.test(s));
      if (rxs.length && !passt(sample) && !Object.values(XS_BUILTIN).some(passt)) {
        const uuid = globalThis.crypto?.randomUUID?.();
        if (uuid && passt(uuid)) return uuid;
      }
      return konformerBeispielwert(res.patterns, Object.values(XS_BUILTIN), sample);
    }
    return sample;
  }

  /**
   * Typ-Verstoss eines konkret eingegebenen Beispielwerts — null, wenn der Wert
   * konform ist oder der Typ nicht geprueft werden kann. Prueft Codelisten,
   * Enumerationen, xs:pattern-Facetten und die gaengigen Builtin-Formate.
   */
  wertProblem(n: PlaceholderNode, wert: string | null | undefined): string | null {
    const w = (wert ?? '').trim();
    if (!w) return null;
    if (n.codelist) {
      const eff = this.clWerte(n.codelist);
      if (eff && eff.length && !eff.some((x) => x.value === w))
        return `„${w}" ist kein Wert der Codeliste${n.codelist.nameLang ? ' ' + n.codelist.nameLang : ''}`;
      return null;
    }
    const res = this.resolveType(n.typeName);
    const tn = n.typeName ?? 'des Feldes';
    if (res.enumWerte && res.enumWerte.length)
      return res.enumWerte.some((e) => e.value === w) ? null : `„${w}" ist kein zulässiger Wert von ${tn}`;
    if (res.patterns) {
      const rxs = res.patterns.map(compileXsdPattern).filter((r): r is RegExp => !!r);
      if (rxs.length && !rxs.some((r) => r.test(w)))
        return `Entspricht nicht dem Datentyp ${tn} — erwartet z. B. „${konformerBeispielwert(
          res.patterns, Object.values(XS_BUILTIN), XS_BUILTIN[res.builtin ?? ''] ?? 'Beispieltext')}"`;
      return null;
    }
    if (res.builtin) {
      const check = XS_CHECK[res.builtin];
      if (check && !check.test(w))
        return `Entspricht nicht dem Datentyp xs:${res.builtin} — erwartet z. B. „${XS_BUILTIN[res.builtin]}"`;
    }
    return null;
  }

  /**
   * Aufloesung der simpleType-Kette: terminaler Builtin, Enumerationswerte
   * oder die Pattern-Facette des spezifischsten Typs (mehrere xs:pattern im
   * selben Restriktions-Schritt sind XSD-seitig Alternativen).
   */
  private resolveType(typeName: string | null): {
    builtin: string | null;
    enumWerte: EnumWert[] | null;
    patterns: string[] | null;
  } {
    const idx = this.state.idx();
    const seen = new Set<string>();
    let patterns: string[] | null = null;
    let t = typeName;
    while (t && !seen.has(t)) {
      seen.add(t);
      if (XS_BUILTIN[t] !== undefined) return { builtin: t, enumWerte: null, patterns };
      const st = idx ? idx.st[t] : undefined;
      if (!st) break;
      const en = this.parser.enumsOfST(st, idx!);
      if (en && en.length) return { builtin: null, enumWerte: en, patterns };
      const r = kid(st, 'restriction');
      if (r && !patterns) {
        const ps = kids(r, 'pattern')
          .map((p) => p.getAttribute('value'))
          .filter((v): v is string => !!v);
        if (ps.length) patterns = ps;
      }
      t = r ? local(r.getAttribute('base')) : null;
    }
    return { builtin: null, enumWerte: null, patterns };
  }
}
