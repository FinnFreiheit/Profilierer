import { Injectable, inject } from '@angular/core';
import { DiffAnc, DiffArt, DiffEntry, DiffResult } from '../../models/diff.model';
import { XsdDoc } from '../../models/xsd-index.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { XsdParserService } from './xsd-parser.service';
import { ToastService } from './toast.service';

/**
 * Versionsvergleich (Diff). Portiert aus Profilierer.html (Funktionsgruppe I,
 * Z.2164-2331): flache Schema-Vergleiche, Diff-Karte fuer die Baum-Markierung
 * und Laden der Vergleichsversion.
 */
@Injectable({ providedIn: 'root' })
export class DiffService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly parser = inject(XsdParserService);
  private readonly toast = inject(ToastService);

  /** profiledUnter (Z.2186-2192): ist unter diesem Pfad etwas profiliert? */
  profiledUnder(absPath: string): boolean {
    if (this.state.elemente()[absPath]) return true;
    const p1 = absPath + '/';
    const p2 = absPath + '@';
    for (const k of Object.keys(this.state.elemente()))
      if (k.startsWith(p1) || k.startsWith(p2)) return true;
    for (const k of Object.keys(this.state.auspraegungen()))
      if (k === absPath || k.startsWith(p1) || k.startsWith(p2)) return true;
    return false;
  }

  /** computeDiff (Z.2193-2221). */
  computeDiff(): DiffResult {
    const idxA = this.state.idx();
    const idxB = this.state.idxB();
    const res: DiffResult = { msgOnlyA: [], msgOnlyB: [], rows: [], msgInB: true };
    if (!idxA || !idxB) return res;
    const namesA = new Set(idxA.messages.map((m) => m.name));
    const namesB = new Set(idxB.messages.map((m) => m.name));
    res.msgOnlyA = [...namesA].filter((n) => !namesB.has(n)).sort();
    res.msgOnlyB = [...namesB].filter((n) => !namesA.has(n)).sort();
    const msgName = this.state.msgName();
    if (msgName) {
      if (!idxB.el[msgName]) {
        res.msgInB = false;
        return res;
      }
      const A = this.tree.flattenSchema(msgName, idxA);
      const B = this.tree.flattenSchema(msgName, idxB);
      if (A && B) {
        for (const [k, va] of A) {
          const vb = B.get(k);
          const abs = msgName + k;
          if (!vb)
            res.rows.push({
              art: 'entfernt',
              rel: k,
              info: '',
              typ: va.typ,
              prof: this.profiledUnder(abs),
            });
          else {
            const ch: string[] = [];
            if (va.kard !== vb.kard) ch.push('Kardinalität ' + va.kard + ' → ' + vb.kard);
            if (va.typ !== vb.typ) ch.push('Typ ' + (va.typ || '—') + ' → ' + (vb.typ || '—'));
            else if (va.cl !== vb.cl)
              ch.push('Codeliste ' + (va.cl || '—') + ' → ' + (vb.cl || '—'));
            if (ch.length)
              res.rows.push({
                art: 'geändert',
                rel: k,
                info: ch.join(' · '),
                typ: vb.typ || va.typ,
                prof: this.profiledUnder(abs),
              });
          }
        }
        for (const [k, vb] of B)
          if (!A.has(k))
            res.rows.push({
              art: 'neu',
              rel: k,
              info: 'Kardinalität ' + vb.kard,
              typ: vb.typ,
              prof: false,
            });
        res.rows.sort((a, b) => a.rel.localeCompare(b.rel));
      }
    }
    return res;
  }

  /** computeDiffMap (Z.2222-2240): Diff-Karte + Vorfahren-Zaehler fuer den Baum. */
  computeDiffMap(): void {
    this.state.diffMap.set(null);
    this.state.diffAnc.set(null);
    if (!this.state.idxB() || !this.state.msgName()) return;
    const d = this.computeDiff();
    this.state.diffMap.set(new Map(d.rows.map((r) => [r.rel, r] as [string, DiffEntry])));
    const anc = new Map<string, DiffAnc>();
    const bump = (p: string, art: DiffArt): void => {
      const e = anc.get(p) || { neu: 0, entfernt: 0, geändert: 0 };
      e[art]++;
      anc.set(p, e);
    };
    for (const r of d.rows) {
      bump('', r.art);
      const segs = r.rel.split('/').filter(Boolean);
      let p = '';
      for (let i = 0; i < segs.length - 1; i++) {
        p += '/' + segs[i];
        bump(p, r.art);
      }
    }
    this.state.diffAnc.set(anc);
  }

  /** loadXsdB (Z.2313-2331): Vergleichs-Schemaordner laden und Diff aktivieren. */
  async loadXsdB(files: FileList | File[]): Promise<boolean> {
    const xsds = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.xsd'));
    if (!xsds.length) {
      this.toast.show('Keine .xsd-Dateien im gewählten Ordner gefunden.');
      return false;
    }
    const parser = new DOMParser();
    const docs: XsdDoc[] = [];
    for (const f of xsds) {
      const dom = parser.parseFromString(await f.text(), 'application/xml');
      if (!dom.getElementsByTagName('parsererror').length) docs.push({ file: f.name, dom });
    }
    const { idx } = this.parser.buildIndexFrom(docs);
    this.state.idxB.set(idx);
    this.state.showDiff.set(true);
    this.computeDiffMap();
    this.toast.show(`Vergleichsversion ${idx.version || '?'} geladen (${docs.length} Schemata).`);
    return true;
  }
}
