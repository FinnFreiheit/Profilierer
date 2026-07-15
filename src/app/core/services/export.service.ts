import { Injectable, inject } from '@angular/core';
import type { Workbook, Worksheet } from 'exceljs';
import { TreeNode } from '../../models/node.model';
import { CodelistInfo } from '../../models/codelist.model';
import { Auspraegung, ElementProfile, Wirkung } from '../../models/profile.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { ValueService } from './value.service';
import { NavService } from './nav.service';
import { GuidedService } from './guided.service';
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

/** Eine Zeile eines Struktur-Sheets im NGem-Excel-Layout. */
interface ExcelZeile {
  art: 'el' | 'desc';
  tiefe: number;
  /** Elementname bzw. Beschreibungstext. */
  text: string;
  typ?: string;
  anzahl?: string;
  status?: string;
  testdaten?: string;
}

/** Farben des NGem-Layouts (ARGB). */
const XL_HEADER = 'FFFFC000';
const XL_SZENARIO = 'FFC6E0B4';
const XL_TESTDATEN = 'FFBDD7EE';
/**
 * Gliederungsstreifen je Einrueck-Tiefe (Referenz: Office-Themefarben
 * accent6/5/4/2/1/lt2 mit Tint 0,6 fuer die Spalten A..F, dann wiederholt).
 */
const XL_STREIFEN = ['FFC6DEB5', 'FFB4C7E7', 'FFFFE699', 'FFF8CBAD', 'FFBDD7EE', 'FFF5F5F5'];
const XL_FONT = { name: 'Arial', size: 10 };

/** Kompakte Kardinalitaet im Referenz-Stil ("1", "0..1", "1..n"). */
function kurzKard(min: string, max: string): string {
  return fmtKard(min, max).replace('*', 'n');
}

/**
 * Sprechender Kurzname einer Codeliste fuer den Sheet-Namen:
 * "Code.ENOVA.ErsuchenSachentscheidung.Typ3" → "ErsuchenSachentscheidung".
 */
function clKurzname(cl: CodelistInfo): string {
  const segs = (cl.typeName || '').split('.');
  if (segs.length > 1) {
    const ohneTyp = /^Typ\d+$/.test(segs[segs.length - 1]!) ? segs.slice(0, -1) : segs;
    return ohneTyp[ohneTyp.length - 1]!;
  }
  return cl.nameLang || cl.kennung;
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
  private readonly guided = inject(GuidedService);
  private readonly dl = inject(DownloadService);
  private readonly toast = inject(ToastService);

  /**
   * Weiche Vollstaendigkeit (gefuehrter Modus): bei offenen Entscheidungen vor
   * dem Export warnen, aber nicht blockieren. Bei Abbruch zum naechsten offenen
   * Punkt springen. Gibt true zurueck, wenn der Export fortgesetzt werden soll.
   */
  private bestaetigeOffeneEntscheidungen(): boolean {
    if (!this.state.guided()) return true;
    const { x, y } = this.guided.fortschritt();
    const offen = y - x;
    if (!offen) return true;
    if (confirm(`Noch ${offen} offene Entscheidung${offen === 1 ? '' : 'en'} — trotzdem exportieren?`)) return true;
    this.guided.gotoNextOpen();
    this.toast.show('Export abgebrochen — nächste offene Entscheidung ausgewählt.');
    return false;
  }

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

  // ── Excel (NGem-Abstimmungsformat) ──────────────────────────────────
  //
  // Arbeitsmappe nach dem Vorbild der manuell gepflegten eNoVA-Abstimmungs-
  // Excel (NGem): ein Hauptsheet mit den Fachdaten der Nachricht (die
  // Type.GDS.*-Kinder der Wurzel kollabiert auf je eine Zeile), je ein
  // Typ-Sheet fuer diese Kinder, vollstaendige Codelisten-Sheets fuer die
  // Fachdaten-Codelisten und zuletzt das Meta-Sheet "Szenario" mit Legende.
  async exportExcel(): Promise<void> {
    if (!this.bestaetigeOffeneEntscheidungen()) return;
    const root = this.state.root();
    if (!root) return;
    const mod = await import('exceljs');
    const Excel = (mod as { default?: typeof import('exceljs') }).default ?? mod;
    const wb: Workbook = new Excel.Workbook();
    const belegt = new Set<string>();
    const sheetName = (roh: string): string => {
      const basis = (roh.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);
      let name = basis;
      for (let i = 2; belegt.has(name.toLowerCase()); i++) name = basis.slice(0, 28) + ' ' + i;
      belegt.add(name.toLowerCase());
      return name;
    };
    this.tree.expandNode(root);
    const kinder = root.children ?? [];
    const gdsKinder = kinder.filter((c) => !c.synthetic && c.typeName?.startsWith('Type.GDS.'));

    // Hauptsheet: Nachricht mit kollabierten GDS-Kindern.
    const hauptZeilen: ExcelZeile[] = [];
    this.sammleZeilen(kinder, 0, hauptZeilen, (n) => gdsKinder.includes(n));
    this.schreibeStrukturSheet(
      wb, sheetName(this.state.meta().name || 'Nachricht'),
      this.state.msgName() || root.name, hauptZeilen,
    );

    // Je ein Typ-Sheet pro GDS-Kind (voll ausgeklappt).
    for (const g of gdsKinder) {
      this.tree.expandNode(g);
      const zeilen: ExcelZeile[] = [];
      this.sammleZeilen(g.children ?? [], 0, zeilen);
      this.schreibeStrukturSheet(wb, sheetName(g.typeName!), g.typeName!, zeilen);
    }

    // Codelisten der Fachdaten (nicht ausgeschlossen) — vollstaendige Werte.
    const codelisten = new Map<string, CodelistInfo>();
    this.sammleCodelisten(kinder.filter((c) => !gdsKinder.includes(c)), codelisten);
    for (const cl of codelisten.values()) this.schreibeCodelistSheet(wb, sheetName('CL ' + clKurzname(cl)), cl);

    this.schreibeMetaSheet(wb, sheetName('Szenario'));

    const buf = await wb.xlsx.writeBuffer();
    this.dl.download(
      this.dl.profilFilename('xlsx'), buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    this.toast.show('Excel exportiert.');
  }

  /**
   * Sammelt die Zeilen eines Struktur-Sheets: je Element eine fette Namens-
   * zeile, darunter die XSD-Doku als Beschreibungszeile ("." als Fueller in
   * der Szenariospalte, wie in der Referenz-Excel). Auspraegungen erscheinen
   * als wiederholte Bloecke "name (Ausprägungsname)". `kollabiert` greift nur
   * auf dieser Ebene (fuer die GDS-Kinder der Wurzel im Hauptsheet).
   */
  private sammleZeilen(
    kinder: TreeNode[], tiefe: number, zeilen: ExcelZeile[],
    kollabiert?: (n: TreeNode) => boolean, maxTiefe = 30,
  ): void {
    for (const n of kinder) {
      // Vorab expandieren: erst dabei wird n.model gesetzt ([choice]-Marker).
      if (!this.tree.isLeaf(n)) this.tree.expandNode(n);
      const p = this.state.elemente()[n.path] ?? {};
      const k = this.state.effKard(n);
      const status = this.statusText(n.path, p);
      zeilen.push({
        art: 'el', tiefe, text: n.name,
        // Auch echte Elemente mit choice-Inhalt (auswahl_*) als [choice] markieren.
        typ: n.synthetic ? `[${n.model}]` : n.typeName || (n.model === 'choice' ? '[choice]' : ''),
        anzahl: kurzKard(n.min, n.max) + (k.changed ? '\n' + kurzKard(k.min, k.max) : ''),
        status, testdaten: p.beispiel || '',
      });
      if (n.doc) zeilen.push({ art: 'desc', tiefe, text: n.doc, status: status ? '.' : '' });
      if (kollabiert?.(n) || tiefe >= maxTiefe || n.recursive) continue;
      const ausps = this.state.auspsOf(n.path);
      if (ausps && ausps.length) {
        for (const a of ausps) {
          const cn = this.tree.ctxNode(n, a.id);
          const ap = this.state.elemente()[cn.path] ?? {};
          zeilen.push({
            art: 'el', tiefe: tiefe + 1, text: `${n.name} (${a.name})`,
            typ: n.typeName || '', anzahl: kurzKard(ap.min || '1', ap.max || '1'),
            status: this.statusText(cn.path, ap), testdaten: ap.beispiel || '',
          });
          if (!this.tree.isLeaf(cn)) {
            this.tree.expandNode(cn);
            this.sammleZeilen(cn.children ?? [], tiefe + 2, zeilen, undefined, maxTiefe);
          }
        }
        continue;
      }
      if (!this.tree.isLeaf(n)) {
        this.tree.expandNode(n);
        this.sammleZeilen(n.children ?? [], tiefe + 1, zeilen, undefined, maxTiefe);
      }
    }
  }

  /** Szenariozelle: Statusname, Anmerkung angehaengt, Werte/Verweis darunter. */
  private statusText(pfad: string, p: ElementProfile): string {
    const st = this.state.statusOf(pfad);
    let s = [st?.name, p.anmerkung].filter(Boolean).join(', ');
    if (p.werte && p.werte.length) {
      const w = p.werte.length <= 6
        ? 'Werte: ' + p.werte.join(', ')
        : `Werte eingeschränkt (${p.werte.length} zulässig)`;
      s = s ? s + '\n' + w : w;
    }
    if (p.refZiel) {
      const r = 'Verweis auf: ' + this.state.auspLabel(p.refZiel);
      s = s ? s + '\n' + r : r;
    }
    return s;
  }

  /** Codelisten unterhalb der Fachdaten, deren Element nicht ausgeschlossen ist. */
  private sammleCodelisten(kinder: TreeNode[], gefunden: Map<string, CodelistInfo>, tiefe = 0): void {
    for (const n of kinder) {
      if (tiefe > 30 || n.recursive) continue;
      const ausgeschlossen =
        this.state.statusOf(n.path)?.wirkung === 'ausgeschlossen' || this.state.inheritedExcluded(n.path);
      if (ausgeschlossen) continue;
      if (n.codelist) {
        const key = n.codelist.kennung || n.codelist.typeName;
        if (!gefunden.has(key)) gefunden.set(key, n.codelist);
      }
      if (!this.tree.isLeaf(n)) {
        this.tree.expandNode(n);
        this.sammleCodelisten(n.children ?? [], gefunden, tiefe + 1);
      }
    }
  }

  /** Ein Struktur-Sheet im NGem-Layout (Einrueckung ueber echte Spalten). */
  private schreibeStrukturSheet(wb: Workbook, name: string, titel: string, zeilen: ExcelZeile[]): void {
    const ws = wb.addWorksheet(name);
    const meta = this.state.meta();
    const profilName = meta.name || 'Szenario';
    const maxTiefe = zeilen.reduce((m, z) => Math.max(m, z.tiefe), 0);
    const einrueck = maxTiefe + 1;
    const colTyp = einrueck + 1;
    const colAnzahl = colTyp + 1;
    const colStatus = colAnzahl + 1;
    const colTest = colStatus + 1;
    for (let c = 1; c < einrueck; c++) ws.getColumn(c).width = 4.8;
    ws.getColumn(einrueck).width = 14;
    ws.getColumn(colTyp).width = 44;
    ws.getColumn(colAnzahl).width = 10;
    ws.getColumn(colStatus).width = 40;
    ws.getColumn(colTest).width = 40;
    const zelle = (r: number, c: number, v: string, fett = false): void => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      cell.font = { ...XL_FONT, bold: fett };
    };
    // Kopfbereich: Version links, Profilname ueber der Szenariospalte,
    // Zeile 2 der technische Nachrichten-/Typname, Zeile 3 die Spaltenkoepfe.
    zelle(1, 1, 'XJustiz-Version ' + this.state.version(), true);
    zelle(1, colStatus, profilName, true);
    zelle(2, 1, titel, true);
    zelle(3, 1, 'Kindelement', true);
    zelle(3, colTyp, 'Typ', true);
    zelle(3, colAnzahl, 'Anzahl', true);
    for (let c = 1; c <= colAnzahl; c++)
      ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_HEADER } };
    zelle(3, colStatus, profilName + (meta.beschreibung ? '\n' + meta.beschreibung : ''), true);
    ws.getCell(3, colStatus).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_SZENARIO } };
    zelle(3, colTest, 'Testdaten\n' + profilName, true);
    ws.getCell(3, colTest).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_TESTDATEN } };
    for (const c of [colStatus, colTest]) ws.getCell(3, c).alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(3).height = 52;
    ws.views = [{ state: 'frozen', ySplit: 3 }];

    let r = 4;
    for (const z of zeilen) {
      const cName = z.tiefe + 1;
      if (z.art === 'el') {
        zelle(r, cName, z.text, true);
        if (z.typ) zelle(r, colTyp, z.typ);
        if (z.anzahl) zelle(r, colAnzahl, z.anzahl);
      } else {
        // Beschreibungszeilen ohne Merge — der Text laeuft ueber die leeren
        // Nachbarzellen (wie in der Referenz), Streifen bleiben zellgenau.
        zelle(r, cName, z.text);
      }
      if (z.status) {
        zelle(r, colStatus, z.status);
        ws.getCell(r, colStatus).alignment = { wrapText: true, vertical: 'top' };
      }
      if (z.testdaten) zelle(r, colTest, z.testdaten);
      if (z.anzahl && z.anzahl.includes('\n'))
        ws.getCell(r, colAnzahl).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r).height = 25;
      r++;
    }
    // Gliederungsstreifen wie in der Referenz: jedes Element mit Kindzeilen
    // bekommt in seiner Einrueckspalte einen kurzen Streifen von der eigenen
    // Zeile ueber die Beschreibungszeile bis zur Zeile des ersten Kindes,
    // dazu die Typ-/Anzahl-Zellen der eigenen Zeile; Farbe rotiert je Tiefe.
    const fuelle = (rr: number, c: number, argb: string): void => {
      ws.getCell(rr, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    };
    for (let i = 0; i < zeilen.length; i++) {
      const z = zeilen[i]!;
      if (z.art !== 'el') continue;
      let j = i + 1;
      while (j < zeilen.length && zeilen[j]!.art !== 'el') j++;
      if (j >= zeilen.length || zeilen[j]!.tiefe <= z.tiefe) continue;
      const farbe = XL_STREIFEN[z.tiefe % XL_STREIFEN.length]!;
      for (let rr = 4 + i; rr <= 4 + j; rr++) fuelle(rr, z.tiefe + 1, farbe);
      fuelle(4 + i, colTyp, farbe);
      fuelle(4 + i, colAnzahl, farbe);
    }
    // Die Szenariospalte ist in der Referenz durchgaengig gefuellt.
    for (let rr = 4; rr < r; rr++)
      ws.getCell(rr, colStatus).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_SZENARIO } };
  }

  /** Ein Codelisten-Sheet: Titelzeile, Header code|wert, vollstaendige Werte. */
  private schreibeCodelistSheet(wb: Workbook, name: string, cl: CodelistInfo): void {
    const ws = wb.addWorksheet(name);
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 100;
    const titel = ws.getCell(1, 1);
    titel.value = 'Codeliste ' + (cl.typeName || cl.nameLang || cl.kennung);
    titel.font = { ...XL_FONT, bold: true };
    for (const [c, v] of [[1, 'code'], [2, 'wert']] as const) {
      const cell = ws.getCell(2, c);
      cell.value = v;
      cell.font = { ...XL_FONT, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_HEADER } };
    }
    const werte = this.values.clWerte(cl);
    if (!werte) {
      const hinweis = ws.getCell(3, 1);
      hinweis.value = `Werte nicht geladen (XRepository): ${cl.kennung}`;
      hinweis.font = { ...XL_FONT, italic: true };
      return;
    }
    let r = 3;
    for (const w of werte) {
      ws.getCell(r, 1).value = w.value;
      ws.getCell(r, 1).font = XL_FONT;
      ws.getCell(r, 2).value = w.label;
      ws.getCell(r, 2).font = XL_FONT;
      r++;
    }
  }

  /** Meta-Sheet "Szenario" (letztes Sheet): Metadaten + Statuslegende. */
  private schreibeMetaSheet(wb: Workbook, name: string): void {
    const ws = wb.addWorksheet(name);
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 70;
    const meta = this.state.meta();
    const wirkTxt: Record<Wirkung, string> = {
      pflicht: 'muss vorkommen', optional: 'darf vorkommen',
      ausgeschlossen: 'darf nicht vorkommen', markierung: 'nur Markierung',
    };
    const paare: [string, string][] = [
      ['XJustiz Profilierer', ''],
      ['', ''],
      ['Szenario', meta.name || ''],
      ['Nachricht', this.state.msgName() || ''],
      ['XJustiz-Version', this.state.version()],
      ['Autor', meta.autor || ''],
      ['Beschreibung', meta.beschreibung || ''],
      ['Stand', meta.datum || new Date().toLocaleDateString('de-DE')],
      ['', ''],
      ['Statusstufen', ''],
    ];
    let r = 1;
    for (const [a, b] of paare) {
      if (a) {
        ws.getCell(r, 1).value = a;
        ws.getCell(r, 1).font = { ...XL_FONT, bold: r === 1 || a === 'Statusstufen' };
      }
      if (b) {
        ws.getCell(r, 2).value = b;
        ws.getCell(r, 2).font = XL_FONT;
      }
      r++;
    }
    for (const s of this.state.statuses()) {
      const cell = ws.getCell(r, 1);
      cell.value = s.name;
      cell.font = XL_FONT;
      const argb = 'FF' + s.farbe.replace('#', '').toUpperCase();
      if (/^FF[0-9A-F]{6}$/.test(argb))
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      ws.getCell(r, 2).value = wirkTxt[s.wirkung] || '';
      ws.getCell(r, 2).font = XL_FONT;
      r++;
    }
  }

  // ── Schematron (Z.1906-1993) ────────────────────────────────────────
  exportSchematron(): void {
    if (!this.bestaetigeOffeneEntscheidungen()) return;
    const rules = new Map<string, { test: string; msg: string }[]>();
    const addAssert = (ctx: string, test: string, msg: string): void => {
      if (!rules.has(ctx)) rules.set(ctx, []);
      const arr = rules.get(ctx)!;
      if (!arr.some((a) => a.test === test)) arr.push({ test, msg });
    };
    // Freitext-Festlegungen (anmerkung) als dokumentierende XML-Kommentare je
    // Regel-Kontext — sie verfeinern die Disposition fachlich, sind aber nicht
    // maschinell pruefbar (US "Profilierung gefuehrt erstellen", Kriterium J).
    const comments = new Map<string, string[]>();
    const addComment = (ctx: string, text: string): void => {
      if (!comments.has(ctx)) comments.set(ctx, []);
      const arr = comments.get(ctx)!;
      if (!arr.includes(text)) arr.push(text);
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
      if (p.anmerkung) addComment(parentCtx, `Festlegung zu "${label}": ${p.anmerkung}`);
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
      for (const c of comments.get(ctx) ?? []) sch += `    <!-- ${this.escComment(c)} -->\n`;
      comments.delete(ctx);
      sch += `    <sch:rule context="${esc(ctx)}">\n`;
      for (const a of asserts) sch += `      <sch:assert test="${esc(a.test)}">${esc(a.msg)}</sch:assert>\n`;
      sch += `    </sch:rule>\n`;
    }
    // Festlegungen zu Kontexten ohne pruefbare Regel (z. B. optional + Anmerkung).
    for (const [ctx, texte] of comments) {
      for (const c of texte) sch += `    <!-- ${this.escComment(c)} (Kontext: ${this.escComment(ctx)}) -->\n`;
    }
    sch += `  </sch:pattern>\n</sch:schema>\n`;
    this.dl.download(this.dl.profilFilename('sch'), sch, 'application/xml');
    const cnt = [...rules.values()].reduce((s, a) => s + a.length, 0);
    this.toast.show(cnt ? `Schematron exportiert (${cnt} Regeln).` : 'Schematron exportiert (noch keine prüfbaren Festlegungen).');
  }

  /** Text fuer XML-Kommentare entschaerfen: `--` ist dort verboten, `-` am Ende ebenso. */
  private escComment(s: string): string {
    const t = s.replace(/-{2,}/g, '–');
    return t.endsWith('-') ? t + ' ' : t;
  }

  // ── Beispiel-XML (Z.2041-2161) ──────────────────────────────────────

  /** Toolbar-Fluss: Guard (geführter Modus), Download, Toast. */
  genBeispielXml(): void {
    if (!this.bestaetigeOffeneEntscheidungen()) return;
    const xml = this.buildBeispielXml();
    if (xml == null) return;
    this.dl.download(this.dl.profilFilename('beispiel.xml'), xml, 'application/xml');
    this.toast.show('Beispiel-XML erzeugt — Platzhalter fachlich prüfen.');
  }

  /**
   * Beispiel-XML aus dem aktuellen Zustand bauen (ohne Download/Toast/Guard) —
   * auch von der Testnachricht-Generierung im Testdatenspeicher genutzt.
   *
   * `instanz` (US "Testnachricht gefuehrt erstellen"): erzeugt die Nachricht
   * als *Instanz-Zwischenstand* statt als Beispiel — Blaetter tragen nur den
   * tatsaechlich erfassten Wert (leer statt Platzhalter), Auswahlen nur den
   * explizit gewaehlten Zweig (offene Auswahl = Kommentar), nicht aufgenommene
   * optionale Gruppen entfallen, keine Beispiel-Kommentare.
   */
  buildBeispielXml(opts?: { instanz?: boolean }): string | null {
    const instanz = !!opts?.instanz;
    const root = this.state.root();
    const msgName = this.state.msgName();
    if (!root || !msgName) return null;
    const IND = '  ';
    const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
    if (!instanz) {
      lines.push(
        `<!-- Beispielnachricht (Entwurf) für Szenario "${this.state.meta().name || ''}" — generiert mit dem XJustiz Profilierer.`,
        `     Platzhalterwerte und Codelisten-Angaben (listURI/listVersionID) sind fachlich zu prüfen. -->`,
      );
    }
    const emitLeaf = (n: TreeNode, depth: number): void => {
      const pad = IND.repeat(depth);
      const v = instanz
        ? esc(this.state.elemente()[n.path]?.beispiel ?? '')
        : esc(this.values.placeholderFor({ name: n.name, path: n.path, typeName: n.typeName, codelist: n.codelist }));
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
      // Instanz: kein Raten — eine Auswahl ohne explizit gewaehlten Zweig
      // bleibt offen (Kommentar), statt einen Zweig zu erfinden.
      if (instanz) return null;
      return children.find((c) => this.state.wirkungOf(c.path) !== 'ausgeschlossen') || null;
    };
    /** Instanz: optionale Gruppe nur, wenn aufgenommen oder mit Inhalt darunter. */
    const gruppeAktiv = (n: TreeNode): boolean => {
      if (!instanz || n.min !== '0') return true;
      return this.state.wirkungOf(n.path) === 'pflicht' || hasProfilBelow(n.path);
    };
    const offeneAuswahl = (n: TreeNode, depth: number): void => {
      if (instanz) lines.push(IND.repeat(depth) + `<!-- Auswahl noch offen: ${esc(n.name)} -->`);
    };
    const emit = (n: TreeNode, depth: number, asName?: string): void => {
      if (depth > 28) return;
      if (n.recursive) {
        lines.push(IND.repeat(depth) + `<!-- ${n.name}: rekursive Struktur, hier gekürzt -->`);
        return;
      }
      if (n.synthetic) {
        if (!gruppeAktiv(n)) return;
        this.tree.expandNode(n);
        if (n.model === 'choice') {
          const b = chooseBranch(n.children ?? []);
          if (b) emit(b, depth);
          else offeneAuswahl(n, depth);
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
          if (!instanz) lines.push(IND.repeat(depth) + `<!-- Ausprägung: ${a.name} -->`);
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
        else offeneAuswahl(n, depth + 1);
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
    return lines.join('\n');
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
