import { Injectable, inject } from '@angular/core';
import type { Workbook } from 'exceljs';
import { TreeNode } from '../../models/node.model';
import { CodelistInfo } from '../../models/codelist.model';
import { ElementProfile, Wirkung } from '../../models/profile.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { ValueService } from './value.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';
import { ExportService } from './export.service';
import { fmtKard } from '../util/pretty.util';

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
  /** Offener interner Hinweis (erledigte werden nicht exportiert). */
  hinweis?: string;
}

/** Farben des NGem-Layouts (ARGB). */
const XL_HEADER = 'FFFFC000';
const XL_SZENARIO = 'FFC6E0B4';
const XL_TESTDATEN = 'FFBDD7EE';
const XL_HINWEIS = 'FFDFF2F0';
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

/**
 * Excel-Export im NGem-Abstimmungslayout. Arbeitsmappe nach dem Vorbild der
 * manuell gepflegten eNoVA-Abstimmungs-Excel (NGem): ein Hauptsheet mit den
 * Fachdaten der Nachricht (die Type.GDS.*-Kinder der Wurzel kollabiert auf je
 * eine Zeile), je ein Typ-Sheet fuer diese Kinder, vollstaendige Codelisten-
 * Sheets fuer die Fachdaten-Codelisten und zuletzt das Meta-Sheet "Szenario"
 * mit Legende. ExcelJS wird dynamisch geladen (Lazy-Chunk).
 */
@Injectable({ providedIn: 'root' })
export class ExcelExportService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly values = inject(ValueService);
  private readonly dl = inject(DownloadService);
  private readonly toast = inject(ToastService);
  private readonly exporter = inject(ExportService);

  async exportExcel(): Promise<void> {
    if (!this.exporter.bestaetigeOffeneEntscheidungen()) return;
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
    const kinder = this.tree.kinder(root);
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
      const zeilen: ExcelZeile[] = [];
      this.sammleZeilen(this.tree.kinder(g), 0, zeilen);
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
        // Auch echte Elemente mit choice-Inhalt (auswahl_*) als [choice] markieren;
        // Schema-Erweiterungen deutlich kennzeichnen.
        typ: n.erweiterung
          ? '[Erweiterung] ' + (n.typeName || 'Container')
          : n.synthetic ? `[${n.model}]` : n.typeName || (n.model === 'choice' ? '[choice]' : ''),
        anzahl: kurzKard(n.min, n.max) + (k.changed ? '\n' + kurzKard(k.min, k.max) : ''),
        status, testdaten: p.beispiel || '',
        hinweis: (!p.hinweisErledigt && p.hinweis) || '',
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
            hinweis: (!ap.hinweisErledigt && ap.hinweis) || '',
          });
          this.sammleZeilen(this.tree.kinder(cn), tiefe + 2, zeilen, undefined, maxTiefe);
        }
        continue;
      }
      this.sammleZeilen(this.tree.kinder(n), tiefe + 1, zeilen, undefined, maxTiefe);
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
    // Zusatzspalte fuer offene interne Hinweise — nur wenn welche vorhanden sind,
    // damit das Referenzlayout sonst unveraendert bleibt.
    const colHinweis = zeilen.some((z) => z.hinweis) ? colTest + 1 : 0;
    for (let c = 1; c < einrueck; c++) ws.getColumn(c).width = 4.8;
    ws.getColumn(einrueck).width = 14;
    ws.getColumn(colTyp).width = 44;
    ws.getColumn(colAnzahl).width = 10;
    ws.getColumn(colStatus).width = 40;
    ws.getColumn(colTest).width = 40;
    if (colHinweis) ws.getColumn(colHinweis).width = 40;
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
    if (colHinweis) {
      zelle(3, colHinweis, 'Hinweise', true);
      ws.getCell(3, colHinweis).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_HINWEIS } };
    }
    for (const c of colHinweis ? [colStatus, colTest, colHinweis] : [colStatus, colTest])
      ws.getCell(3, c).alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(3).height = 52;
    ws.views = [{ state: 'frozen', ySplit: 3 }];

    // Zeilenhoehe aus der Textlaenge: gemergte Zellen passt Excel nicht
    // automatisch an, daher Zeilen (~Zeichen je Zeilenbreite) selbst schaetzen.
    const breiteAb = (von: number): number => {
      let w = 44 + 10 + 14; // Typ + Anzahl + letzte Einrueckspalte
      for (let c = von; c < einrueck; c++) w += 4.8;
      return w;
    };
    const zeilenbedarf = (t: string | undefined, breite: number): number =>
      !t ? 1 : t.split('\n').reduce((s, p) => s + Math.max(1, Math.ceil(p.length / breite)), 0);

    let r = 4;
    for (const z of zeilen) {
      const cName = z.tiefe + 1;
      if (z.art === 'el') {
        zelle(r, cName, z.text, true);
        if (z.typ) zelle(r, colTyp, z.typ);
        if (z.anzahl) zelle(r, colAnzahl, z.anzahl);
      } else {
        // Beschreibungszeile: bis zur Anzahl-Spalte gemergt, mit Umbruch.
        zelle(r, cName, z.text);
        ws.mergeCells(r, cName, r, colAnzahl);
        ws.getCell(r, cName).alignment = { wrapText: true, vertical: 'top' };
      }
      if (z.status) {
        zelle(r, colStatus, z.status);
        ws.getCell(r, colStatus).alignment = { wrapText: true, vertical: 'top' };
      }
      if (z.testdaten) {
        zelle(r, colTest, z.testdaten);
        ws.getCell(r, colTest).alignment = { wrapText: true, vertical: 'top' };
      }
      if (colHinweis && z.hinweis) {
        zelle(r, colHinweis, z.hinweis);
        ws.getCell(r, colHinweis).alignment = { wrapText: true, vertical: 'top' };
      }
      if (z.anzahl && z.anzahl.includes('\n'))
        ws.getCell(r, colAnzahl).alignment = { wrapText: true, vertical: 'top' };
      const zeilenzahl = Math.max(
        z.art === 'desc' ? zeilenbedarf(z.text, breiteAb(cName)) : 1,
        zeilenbedarf(z.status, 40),
        zeilenbedarf(z.testdaten, 40),
        zeilenbedarf(z.hinweis, 40),
        zeilenbedarf(z.anzahl, 10),
      );
      ws.getRow(r).height = Math.max(25, 13 * zeilenzahl + 4);
      r++;
    }
    // Gliederungsfaerbung: jedes Elternelement (mit eingerueckten Kindzeilen)
    // faerbt (a) seine Einrueckspalte vertikal ueber den gesamten Block —
    // bis zum naechsten Element derselben oder einer hoeheren Ebene — und
    // (b) seine Element- und Beschreibungszeile horizontal von der eigenen
    // Spalte bis zur Anzahl-Spalte. Farbe rotiert je Tiefe.
    const fuelle = (rr: number, c: number, argb: string): void => {
      ws.getCell(rr, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    };
    for (let i = 0; i < zeilen.length; i++) {
      const z = zeilen[i]!;
      if (z.art !== 'el') continue;
      let j = i + 1;
      while (j < zeilen.length && zeilen[j]!.art !== 'el') j++;
      if (j >= zeilen.length || zeilen[j]!.tiefe <= z.tiefe) continue; // Blatt
      let ende = j;
      while (ende < zeilen.length && !(zeilen[ende]!.art === 'el' && zeilen[ende]!.tiefe <= z.tiefe)) ende++;
      const farbe = XL_STREIFEN[z.tiefe % XL_STREIFEN.length]!;
      for (let rr = 4 + i; rr < 4 + ende; rr++) fuelle(rr, z.tiefe + 1, farbe);
      const bandBis = zeilen[i + 1]?.art === 'desc' ? i + 1 : i;
      for (let bi = i; bi <= bandBis; bi++)
        for (let c = z.tiefe + 1; c <= colAnzahl; c++) fuelle(4 + bi, c, farbe);
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
      // Nicht gemergte Zellen mit Umbruch passt Excel selbst in der Hoehe an.
      ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' };
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
        ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' };
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
}
