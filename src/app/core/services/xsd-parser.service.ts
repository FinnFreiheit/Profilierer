import { Injectable } from '@angular/core';
import { CodelistInfo, EnumWert } from '../../models/codelist.model';
import { TreeNode } from '../../models/node.model';
import { MessageRef, ParticleModel, XsdDoc, XsdIndex } from '../../models/xsd-index.model';
import { XS, appinfoOf, docOf, kid, kids, local } from '../util/xml.util';

/**
 * Schema-Parsing und -Indexierung. Portiert aus Profilierer.html
 * (Funktionsgruppe A, Z.348-457 + valueKind Z.580-602). Bewusst zustandslos:
 * der Index wird als Parameter durchgereicht (loest den globalen `withIdx`-Hack
 * Z.379 sauber auf — Diff nutzt einfach einen zweiten Index).
 */
@Injectable({ providedIn: 'root' })
export class XsdParserService {
  /** buildIndexFrom (Z.348-373): baut den Schema-Index ueber alle Dokumente. */
  buildIndexFrom(docs: XsdDoc[]): { idx: XsdIndex; version: string; kennung: string } {
    const idx: XsdIndex = { ct: {}, st: {}, el: {}, messages: [] };
    let version = '';
    let kennung = '';
    for (const { file, dom } of docs) {
      const schema = dom.documentElement;
      if (!schema || schema.localName !== 'schema') continue;
      if (file.startsWith('xjustiz_0000')) {
        version = schema.getAttribute('version') || '';
        const ai = appinfoOf(schema);
        if (ai) {
          const k = ai.getElementsByTagName('kennung')[0];
          if (k) kennung = (k.textContent ?? '').trim();
        }
      }
      for (const c of Array.from(schema.children)) {
        if (c.namespaceURI !== XS) continue;
        const n = c.getAttribute('name');
        if (!n) continue;
        if (c.localName === 'complexType') idx.ct[n] = c;
        else if (c.localName === 'simpleType') idx.st[n] = c;
        else if (c.localName === 'element') {
          idx.el[n] = c;
          if (/^nachricht\./.test(n)) {
            const m: MessageRef = { name: n, doc: docOf(c), file };
            idx.messages.push(m);
          }
        }
      }
    }
    idx.messages.sort((a, b) => a.name.localeCompare(b.name));
    idx.version = version;
    idx.kennung = kennung;
    return { idx, version, kennung };
  }

  /** particlesOfCT (Z.385-415): Partikel eines complexType inkl. Vererbung. */
  particlesOfCT(ct: Element, idx: XsdIndex, seen?: Set<string>): ParticleModel {
    seen = seen || new Set();
    const out: ParticleModel = { model: 'sequence', parts: [], simple: false };
    const grab = (holder: Element): boolean => {
      for (const m of ['sequence', 'choice', 'all'] as const) {
        const g = kid(holder, m);
        if (g) {
          out.model = m;
          out.parts.push(
            ...Array.from(g.children).filter(
              (c) =>
                c.namespaceURI === XS &&
                ['element', 'choice', 'sequence', 'any'].includes(c.localName),
            ),
          );
          return true;
        }
      }
      return false;
    };
    const cc = kid(ct, 'complexContent');
    if (cc) {
      const ext = kid(cc, 'extension');
      const res = kid(cc, 'restriction');
      const h = ext || res;
      if (h) {
        const base = local(h.getAttribute('base'));
        const bct = base ? idx.ct[base] : undefined;
        if (ext && base && bct && !seen.has(base)) {
          seen.add(base);
          const b = this.particlesOfCT(bct, idx, seen);
          out.parts.push(...b.parts);
          if (b.model === 'choice' && !kid(h, 'sequence')) out.model = 'choice';
        }
        grab(h);
        return out;
      }
    }
    const sc = kid(ct, 'simpleContent');
    if (sc) {
      out.simple = true;
      return out;
    }
    grab(ct);
    return out;
  }

  /** enumsOfST (Z.416-434): Enumerationswerte eines simpleType (rekursiv ueber base). */
  enumsOfST(st: Element | null, idx: XsdIndex, seen?: Set<string>): EnumWert[] | null {
    seen = seen || new Set();
    if (!st) return null;
    const r = kid(st, 'restriction');
    if (!r) return null;
    const es = kids(r, 'enumeration');
    if (es.length) {
      return es.map((e) => {
        let label = '';
        const ai = appinfoOf(e);
        if (ai) {
          const w = ai.getElementsByTagName('wert')[0];
          if (w) label = (w.textContent ?? '').trim();
        }
        if (!label) label = docOf(e);
        return { value: e.getAttribute('value') ?? '', label };
      });
    }
    const base = local(r.getAttribute('base'));
    const bst = base ? idx.st[base] : undefined;
    if (base && bst && !seen.has(base)) {
      seen.add(base);
      return this.enumsOfST(bst, idx, seen);
    }
    return null;
  }

  /** codelistOf (Z.435-457): Codelisten-Info aus einem Code.*-Typ. */
  codelistOf(typeName: string | null, idx: XsdIndex): CodelistInfo | null {
    if (!typeName || !/^Code\./.test(typeName)) return null;
    const ct = idx.ct[typeName];
    if (!ct) return null;
    const info: CodelistInfo = {
      typeName,
      nameLang: '',
      kennung: '',
      beschreibung: '',
      werte: null,
    };
    const ai = appinfoOf(ct);
    if (ai) {
      const cl = ai.getElementsByTagName('codeliste')[0];
      if (cl) {
        const g = (t: string): string => {
          const e = cl.getElementsByTagName(t)[0];
          return e ? (e.textContent ?? '').trim() : '';
        };
        info.nameLang = g('nameLang');
        info.kennung = g('kennung');
        info.beschreibung = g('beschreibung');
      }
    }
    let codeEl: Element | null = null;
    const walk = (e: Element): void => {
      for (const c of Array.from(e.children)) {
        if (c.namespaceURI === XS && c.localName === 'element' && c.getAttribute('name') === 'code') {
          codeEl = c;
          return;
        }
        walk(c);
      }
    };
    walk(ct);
    if (codeEl) {
      const t = local((codeEl as Element).getAttribute('type'));
      const stByName = t ? idx.st[t] : undefined;
      if (t && stByName) info.werte = this.enumsOfST(stByName, idx);
      else {
        const ist = kid(codeEl, 'simpleType');
        if (ist) info.werte = this.enumsOfST(ist, idx);
      }
    }
    return info;
  }

  /** valueKind (Z.580-602): fachliche Wertart eines Blatts. */
  valueKind(node: TreeNode, idx: XsdIndex): string {
    if (node.codelist) return 'Code';
    let t: string | null = node.typeName;
    const map: Record<string, string> = {
      date: 'Datum', dateTime: 'Datum + Zeit', time: 'Uhrzeit', integer: 'Zahl', int: 'Zahl',
      nonNegativeInteger: 'Zahl', positiveInteger: 'Zahl', long: 'Zahl', decimal: 'Zahl',
      boolean: 'Ja/Nein', gYear: 'Jahr', gYearMonth: 'Monat', anyURI: 'Link', token: 'Text',
      string: 'Text', normalizedString: 'Text', base64Binary: 'Datei',
    };
    const seen = new Set<string>();
    while (t && !seen.has(t)) {
      seen.add(t);
      const hit = map[t];
      if (hit) return hit;
      if (/^datatype/i.test(t)) return 'Text';
      const st = idx.st[t];
      if (st) {
        const en = this.enumsOfST(st, idx);
        if (en && en.length) return 'Auswahlwert';
        const r = kid(st, 'restriction');
        t = r ? local(r.getAttribute('base')) : null;
      } else if (idx.ct[t]) return 'Text';
      else t = null;
    }
    return 'Wert';
  }
}
