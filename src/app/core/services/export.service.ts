import { Injectable, inject } from '@angular/core';
import { TreeNode } from '../../models/node.model';
import { Auspraegung, Wirkung } from '../../models/profile.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { ValueService } from './value.service';
import { NavService } from './nav.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';
import { esc, XJNS } from '../util/xml.util';
import { fmtKard, kardText, pretty } from '../util/pretty.util';

interface WalkItem {
  kind: 'el' | 'ausp';
  path: string;
  node: TreeNode;
  ausp?: Auspraegung;
  depth: number;
  segs: string[];
}

export interface PrintRow {
  excl: boolean;
  indent: number;
  name: string;
  tech: string;
  anmerkung: string;
  refZiel: string;
  werte: string;
  beispiel: string;
  kardText: string;
  statusName: string;
  statusFarbe: string;
}

/**
 * Exporte: Excel, Schematron, Beispiel-XML. Portiert aus Profilierer.html
 * (Funktionsgruppe H, Z.1824-2161). SheetJS wird dynamisch geladen.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly values = inject(ValueService);
  private readonly nav = inject(NavService);
  private readonly dl = inject(DownloadService);
  private readonly toast = inject(ToastService);

  /** walkFull (Z.1826-1844): Traversierung fuer Exporte (segs = Instanz-Pfad). */
  private walkFull(cb: (x: WalkItem) => void, maxDepth = 30): void {
    const root = this.state.root();
    if (!root) return;
    const rec = (n: TreeNode, depth: number, segs: string[]): void => {
      const mySegs = n.synthetic ? segs : [...segs, n.name];
      cb({ kind: 'el', path: n.path, node: n, depth, segs: mySegs });
      if (depth >= maxDepth || n.recursive) return;
      const ausps = this.state.auspsOf(n.path);
      if (ausps && ausps.length) {
        for (const a of ausps) {
          const cn = this.tree.ctxNode(n, a.id);
          cb({ kind: 'ausp', path: cn.path, node: n, ausp: a, depth: depth + 1, segs: mySegs });
          if (!this.tree.isLeaf(cn)) {
            this.tree.expandNode(cn);
            for (const c of cn.children ?? []) rec(c, depth + 2, mySegs);
          }
        }
        return;
      }
      if (!this.tree.isLeaf(n)) {
        this.tree.expandNode(n);
        for (const c of n.children ?? []) rec(c, depth + 1, mySegs);
      }
    };
    rec(root, 0, []);
  }

  // ── Excel (Z.1847-1903) ─────────────────────────────────────────────
  async exportExcel(): Promise<void> {
    const XLSX = await import('xlsx');
    const rows: (string | number)[][] = [
      ['Ebene', 'Element / Ausprägung', 'Beschreibung', 'Technischer Name', 'Typ', 'Kardinalität (Standard)', 'Status im Szenario', 'Kardinalität (Szenario)', 'Zulässige Werte', 'Beispiel', 'Anmerkung'],
    ];
    const clSheet: string[][] = [['Element (Pfad)', 'Codeliste', 'Kennung', 'Zulässige Werte im Szenario']];
    this.walkFull((x) => {
      const p = this.state.elemente()[x.path] ?? {};
      const st = this.state.statusOf(x.path);
      const inh = this.state.inheritedExcluded(x.path);
      let statusTxt = st ? st.name : '';
      if (!st && inh) statusTxt = '(entfällt — übergeordnet ausgeschlossen)';
      let werte = '';
      if (p.werte && p.werte.length) {
        const cl = x.node.codelist;
        const effW = this.values.clWerte(cl);
        if (effW) {
          const map = Object.fromEntries(effW.map((w) => [w.value, w.label]));
          werte = p.werte.map((v) => v + (map[v] ? ' = ' + map[v] : '')).join('\n');
        } else werte = p.werte.join('\n');
        clSheet.push([
          x.segs.join('/'),
          x.node.codelist ? x.node.codelist.nameLang || x.node.typeName || '' : '',
          x.node.codelist ? x.node.codelist.kennung : '',
          werte,
        ]);
      }
      const ind = '    '.repeat(x.depth);
      if (x.kind === 'ausp') {
        rows.push([
          x.depth, ind + '» ' + x.ausp!.name, p.anmerkung || '', '(Ausprägung von ' + x.node.name + ')', '', '',
          statusTxt, kardText(p.min || '1', p.max || '1'), werte, p.beispiel || '', p.anmerkung || '',
        ]);
      } else {
        const n = x.node;
        const k = this.state.effKard(n);
        const anm = (p.anmerkung || '') + (p.refZiel ? (p.anmerkung ? '\n' : '') + 'Verweis auf: ' + this.state.auspLabel(p.refZiel) : '');
        rows.push([
          x.depth, ind + pretty(n.name), n.doc.split('\n')[0] || '', n.name, n.typeName || '',
          kardText(n.min, n.max), statusTxt, k.changed ? kardText(k.min, k.max) : '', werte, p.beispiel || '', anm,
        ]);
      }
    });
    const meta: (string | number)[][] = [
      ['XJustiz Profilierer'], [],
      ['Szenario', this.state.meta().name || ''],
      ['Nachricht', this.state.msgName() || ''],
      ['XJustiz-Version', this.state.version()],
      ['Autor', this.state.meta().autor || ''],
      ['Beschreibung', this.state.meta().beschreibung || ''],
      ['Stand', this.state.meta().datum || new Date().toLocaleDateString('de-DE')],
      [], ['Statusstufen'],
    ];
    const wirkTxt: Record<Wirkung, string> = {
      pflicht: 'muss vorkommen', optional: 'darf vorkommen', ausgeschlossen: 'darf nicht vorkommen', markierung: 'nur Markierung',
    };
    for (const s of this.state.statuses()) meta.push([s.name, wirkTxt[s.wirkung] || '']);
    const wb = XLSX.utils.book_new();
    const wsM = XLSX.utils.aoa_to_sheet(meta);
    wsM['!cols'] = [{ wch: 26 }, { wch: 70 }];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 55 }, { wch: 55 }, { wch: 34 }, { wch: 34 }, { wch: 18 }, { wch: 26 }, { wch: 18 }, { wch: 40 }, { wch: 24 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsM, 'Szenario');
    XLSX.utils.book_append_sheet(wb, ws, 'Struktur');
    if (clSheet.length > 1) {
      const wsC = XLSX.utils.aoa_to_sheet(clSheet);
      wsC['!cols'] = [{ wch: 60 }, { wch: 30 }, { wch: 44 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, wsC, 'Codelisten');
    }
    XLSX.writeFile(wb, this.dl.profilFilename('xlsx'));
    this.toast.show('Excel exportiert.');
  }

  // ── Schematron (Z.1906-1993) ────────────────────────────────────────
  exportSchematron(): void {
    const rules = new Map<string, { test: string; msg: string }[]>();
    const addAssert = (ctx: string, test: string, msg: string): void => {
      if (!rules.has(ctx)) rules.set(ctx, []);
      const arr = rules.get(ctx)!;
      if (!arr.some((a) => a.test === test)) arr.push({ test, msg });
    };
    const xpath = (segs: string[]): string => '/' + segs.map((s) => 'xj:' + s).join('/');
    const auspMin = new Map<string, number>();
    this.walkFull((x) => {
      if (x.node === this.state.root()) return;
      if (this.state.inheritedExcluded(x.path)) return;
      const p = this.state.elemente()[x.path];
      if (x.kind === 'ausp') {
        const st = this.state.statusOf(x.path);
        if (p && st && st.wirkung === 'pflicht') {
          const key = xpath(x.segs);
          auspMin.set(key, (auspMin.get(key) || 0) + parseInt(p.min || '1', 10));
        }
        return;
      }
      if (x.node.synthetic) return;
      if (!p) return;
      if (x.path.includes('@')) return;
      const w = this.state.wirkungOf(x.path);
      const parentCtx = xpath(x.segs.slice(0, -1));
      const selfCtx = xpath(x.segs);
      const nm = 'xj:' + x.node.name;
      const label = x.segs.slice(1).join('/');
      if (w === 'ausgeschlossen') {
        addAssert(parentCtx, `not(${nm})`, `Das Element "${label}" wird in diesem Szenario nicht verwendet.`);
        return;
      }
      if (w === 'pflicht') addAssert(parentCtx, `${nm}`, `Das Element "${label}" ist in diesem Szenario verpflichtend.`);
      if (p.min && p.min !== '0') addAssert(parentCtx, `count(${nm}) >= ${parseInt(p.min, 10)}`, `"${label}": mindestens ${p.min}-mal erforderlich.`);
      if (p.max && p.max !== '*' && p.max !== 'unbounded') addAssert(parentCtx, `count(${nm}) <= ${parseInt(p.max, 10)}`, `"${label}": höchstens ${p.max}-mal zulässig.`);
      if (p.werte && p.werte.length) {
        const vals = p.werte.map((v) => String(v).split(/\s+[—–-]\s+|\t/)[0]!.trim()).filter(Boolean);
        const seq = vals.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
        addAssert(selfCtx, x.node.codelist ? `code = (${seq})` : `. = (${seq})`, `"${label}": in diesem Szenario sind nur folgende Werte zulässig: ${vals.join(', ')}.`);
      }
    });
    for (const [selfCtx, minSum] of auspMin) {
      const segs = selfCtx.split('/xj:');
      const name = segs[segs.length - 1];
      const parentCtx = segs.slice(0, -1).join('/xj:') || '/';
      addAssert(parentCtx, `count(xj:${name}) >= ${minSum}`, `"${name}": laut Szenario sind mindestens ${minSum} Vorkommen vorgesehen (zwingende Ausprägungen).`);
    }
    const meta = this.state.meta();
    const msgName = this.state.msgName() || '';
    let sch = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Schematron-Profilierung für ${msgName}
  Szenario: ${meta.name || '(ohne Namen)'}
  XJustiz-Version: ${this.state.version()}
  Erzeugt: ${new Date().toISOString().slice(0, 10)} mit dem XJustiz Profilierer
  Hinweis: Diese Regeln gelten ZUSÄTZLICH zur Validierung gegen das XJustiz-Schema (XSD).
-->
<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
  <sch:title>Profilierung ${esc(meta.name || '')} — ${esc(msgName)}</sch:title>
  <sch:ns prefix="xj" uri="${XJNS}"/>
  <sch:pattern id="wurzel">
    <sch:rule context="/">
      <sch:assert test="xj:${msgName}">Erwartet wird eine Nachricht ${esc(msgName)}.</sch:assert>
    </sch:rule>
  </sch:pattern>
  <sch:pattern id="profil">
`;
    for (const [ctx, asserts] of rules) {
      sch += `    <sch:rule context="${esc(ctx)}">\n`;
      for (const a of asserts) sch += `      <sch:assert test="${esc(a.test)}">${esc(a.msg)}</sch:assert>\n`;
      sch += `    </sch:rule>\n`;
    }
    sch += `  </sch:pattern>\n</sch:schema>\n`;
    this.dl.download(this.dl.profilFilename('sch'), sch, 'application/xml');
    const cnt = [...rules.values()].reduce((s, a) => s + a.length, 0);
    this.toast.show(cnt ? `Schematron exportiert (${cnt} Regeln).` : 'Schematron exportiert (noch keine prüfbaren Festlegungen).');
  }

  // ── Beispiel-XML (Z.2041-2161) ──────────────────────────────────────
  genBeispielXml(): void {
    const root = this.state.root();
    const msgName = this.state.msgName();
    if (!root || !msgName) return;
    const IND = '  ';
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<!-- Beispielnachricht (Entwurf) für Szenario "${this.state.meta().name || ''}" — generiert mit dem XJustiz Profilierer.`,
      `     Platzhalterwerte und Codelisten-Angaben (listURI/listVersionID) sind fachlich zu prüfen. -->`,
    ];
    const emitLeaf = (n: TreeNode, depth: number): void => {
      const pad = IND.repeat(depth);
      const v = esc(this.values.placeholderFor({ name: n.name, path: n.path, typeName: n.typeName, codelist: n.codelist }));
      if (n.codelist) {
        const ver = this.values.clVersion(n.codelist) || '~';
        const attrs = n.codelist.kennung ? ` listURI="${esc(n.codelist.kennung)}" listVersionID="${esc(ver)}"` : '';
        lines.push(`${pad}<${n.name}${attrs}>`);
        lines.push(`${pad}${IND}<code>${v}</code>`);
        lines.push(`${pad}</${n.name}>`);
      } else {
        lines.push(`${pad}<${n.name}>${v}</${n.name}>`);
      }
    };
    const hasProfilBelow = (path: string): boolean => {
      const pre1 = path + '/';
      const pre2 = path + '@';
      for (const k of Object.keys(this.state.elemente())) if (k.startsWith(pre1) || k.startsWith(pre2)) return true;
      for (const k of Object.keys(this.state.auspraegungen())) if (k === path || k.startsWith(pre1) || k.startsWith(pre2)) return true;
      return false;
    };
    const forced = new Set<string>();
    {
      const refZiele = new Set(Object.values(this.state.elemente()).filter((p) => p.refZiel).map((p) => p.refZiel!));
      for (const rz of refZiele) {
        const it = this.nav.findItemByPath(rz);
        if (!it || it.kind !== 'ausp') continue;
        const cn = this.tree.ctxNode(it.parentNode, it.ausp.id);
        const q: [TreeNode, TreeNode[]][] = [[cn, []]];
        let found: TreeNode[] | null = null;
        let steps = 0;
        while (q.length && steps++ < 400) {
          const [node, chain] = q.shift()!;
          if (this.tree.isLeaf(node)) continue;
          this.tree.expandNode(node);
          for (const c of node.children ?? []) {
            if ((c.name === 'rollennummer' || c.name === 'beteiligtennummer') && this.tree.isLeaf(c)) {
              found = [...chain, c];
              break;
            }
            if (!c.recursive && chain.length < 4) q.push([c, [...chain, c]]);
          }
          if (found) break;
        }
        if (found) for (const nn of found) forced.add(nn.path);
      }
    }
    const include = (n: TreeNode): boolean => {
      if (forced.has(n.path)) return true;
      const w = this.state.wirkungOf(n.path);
      if (w === 'ausgeschlossen') return false;
      if (w === 'pflicht') return true;
      const p = this.state.elemente()[n.path] ?? {};
      const min = parseInt(p.min || n.min, 10);
      if (min >= 1) return true;
      if (p.beispiel || (p.werte && p.werte.length)) return true;
      if (hasProfilBelow(n.path)) return true;
      return false;
    };
    const chooseBranch = (children: TreeNode[]): TreeNode | null => {
      const decided = children.find((c) => {
        const w = this.state.wirkungOf(c.path);
        return w && w !== 'ausgeschlossen';
      });
      if (decided) return decided;
      return children.find((c) => this.state.wirkungOf(c.path) !== 'ausgeschlossen') || null;
    };
    const emit = (n: TreeNode, depth: number, asName?: string): void => {
      if (depth > 28) return;
      if (n.recursive) {
        lines.push(IND.repeat(depth) + `<!-- ${n.name}: rekursive Struktur, hier gekürzt -->`);
        return;
      }
      if (n.synthetic) {
        this.tree.expandNode(n);
        if (n.model === 'choice') {
          const b = chooseBranch(n.children ?? []);
          if (b) emit(b, depth);
        } else {
          for (const c of n.children ?? []) if (include(c)) emit(c, depth);
        }
        return;
      }
      const name = asName || n.name;
      const ausps = this.state.auspsOf(n.path);
      if (ausps && ausps.length) {
        for (const a of ausps) {
          const cn = this.tree.ctxNode(n, a.id);
          if (this.state.wirkungOf(cn.path) === 'ausgeschlossen') continue;
          lines.push(IND.repeat(depth) + `<!-- Ausprägung: ${a.name} -->`);
          emitInstance(cn, depth, name);
        }
        return;
      }
      emitInstance(n, depth, name);
    };
    const emitInstance = (n: TreeNode, depth: number, name: string): void => {
      if (this.tree.isLeaf(n)) {
        emitLeaf({ ...n, name }, depth);
        return;
      }
      this.tree.expandNode(n);
      const pad = IND.repeat(depth);
      lines.push(`${pad}<${name}>`);
      if (n.model === 'choice') {
        const b = chooseBranch(n.children ?? []);
        if (b) emit(b, depth + 1);
      } else {
        for (const c of n.children ?? []) {
          if (c.synthetic) {
            emit(c, depth + 1);
            continue;
          }
          if (include(c)) emit(c, depth + 1);
        }
      }
      lines.push(`${pad}</${name}>`);
    };
    this.tree.expandNode(root);
    lines.push(`<${msgName} xmlns="${XJNS}">`);
    for (const c of root.children ?? []) {
      if (c.synthetic) {
        emit(c, 1);
        continue;
      }
      if (include(c)) emit(c, 1);
    }
    lines.push(`</${msgName}>`);
    this.dl.download(this.dl.profilFilename('beispiel.xml'), lines.join('\n'), 'application/xml');
    this.toast.show('Beispiel-XML erzeugt — Platzhalter fachlich prüfen.');
  }

  // ── Druckzeilen (doPrint, Z.2334-2362) ──────────────────────────────
  buildPrintRows(): PrintRow[] {
    const rows: PrintRow[] = [];
    const onlyProfile = this.state.onlyProfile();
    this.walkFull((x) => {
      const p = this.state.elemente()[x.path] ?? {};
      const st = this.state.statusOf(x.path);
      const inh = this.state.inheritedExcluded(x.path);
      const excl = st?.wirkung === 'ausgeschlossen' || inh;
      if (onlyProfile && excl) return;
      const name = x.kind === 'ausp' ? '» ' + x.ausp!.name : pretty(x.node.name);
      const kt =
        x.kind === 'ausp'
          ? kardText(p.min || '1', p.max || '1')
          : kardText(this.state.effKard(x.node).min, this.state.effKard(x.node).max);
      rows.push({
        excl,
        indent: x.depth * 14,
        name,
        tech: x.kind === 'el' ? x.node.name : '',
        anmerkung: p.anmerkung || '',
        refZiel: p.refZiel ? this.state.auspLabel(p.refZiel) : '',
        werte: p.werte && p.werte.length ? p.werte.map((v) => String(v).split(/\s+[—–-]\s+/)[0]).join(', ') : '',
        beispiel: p.beispiel || '',
        kardText: kt,
        statusName: st ? st.name : inh ? 'entfällt' : '',
        statusFarbe: st ? st.farbe : '#999',
      });
    });
    return rows;
  }
}
