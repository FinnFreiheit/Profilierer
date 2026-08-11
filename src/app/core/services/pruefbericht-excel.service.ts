import { Injectable, inject } from '@angular/core';
import type { Workbook, Worksheet } from 'exceljs';
import { Pruefbericht } from '../../models/pruefbericht.model';
import { Verstoss } from './konformitaet.service';
import { abweichungen, nachbeauftragt } from '../util/pruefbericht.util';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';

/** Farben und Schrift wie im bestehenden Excel-Export (ARGB). */
const XL_HEADER = 'FFFFC000';
const XL_KOPF = 'FFF5F5F5';
const XL_FONT = { name: 'Arial', size: 10 };

/** Anzeigename einer Verstossart in der Tabellenspalte „Art". */
const ART_TEXT: Record<Verstoss['art'], string> = {
  ausgeschlossen: 'ausgeschlossen',
  kardinalitaet: 'Kardinalität',
  wert: 'Wert',
  vorkommen: 'Vorkommen',
  pflichtwert: 'Pflichtwert',
  fehlt: 'fehlt',
};

/**
 * Der Prüfbericht als Excel-Arbeitsmappe (#108) — das Papier, das an den
 * Hersteller geht und in die AG-Sitzungsmappe kommt. Am Bildschirm ist der
 * Bericht flüchtig; als Nachweis braucht er eine Datei mit Datum und der
 * geprüften Fassung.
 *
 * Aufbau: ein Kopfblatt mit den Angaben und Zählungen, dann je Befundart ein
 * Tabellenblatt. Die **Trennung** der Abschnitte ist derselbe Zweck wie in der
 * Anzeige: Abweichungen gehen an den Absender, Lücken an die eigene
 * Profilierung, nachbeauftragte Elemente an niemanden von beiden.
 *
 * ExcelJS wird dynamisch geladen (Lazy-Chunk), wie im `ExcelExportService`.
 */
@Injectable({ providedIn: 'root' })
export class PruefberichtExcelService {
  private readonly dl = inject(DownloadService);
  private readonly toast = inject(ToastService);

  async exportiere(b: Pruefbericht): Promise<void> {
    const mod = await import('exceljs');
    const Excel = (mod as { default?: typeof import('exceljs') }).default ?? mod;
    const wb: Workbook = new Excel.Workbook();

    this.schreibeKopfblatt(wb, b);
    const abw = abweichungen(b);
    const erw = nachbeauftragt(b);

    this.schreibeBefundBlatt(
      wb,
      'Abweichungen',
      ['Pfad', 'Art', 'Befund'],
      abw.map((v) => [v.pfad, ART_TEXT[v.art], v.text]),
      'Was die Nachricht nicht einhält.',
    );
    this.schreibeBefundBlatt(
      wb,
      'Lücken der Profilierung',
      ['Pfad', 'belegter Wert', 'Befund'],
      b.luecken.map((l) => [l.pfad, l.wert, l.text]),
      'Mangel der Profilierung, nicht der Nachricht: hier wurde nie entschieden.',
    );
    // Nur wo es welche gibt — ein leeres Blatt sagt nichts und stiftet Verwirrung.
    if (erw.length)
      this.schreibeBefundBlatt(
        wb,
        'Nachbeauftragte Elemente',
        ['Pfad', 'Art', 'Befund'],
        erw.map((v) => [v.pfad, ART_TEXT[v.art], v.text]),
        'Diese Elemente gibt es im XJustiz-Schema nicht — eine gültige Nachricht kann sie ' +
          'nicht enthalten. Sie zählen nicht gegen die Nachricht.',
      );
    if (b.kopf.schemaFehler.length)
      this.schreibeBefundBlatt(
        wb,
        'Schemafehler',
        ['Meldung'],
        b.kopf.schemaFehler.map((t) => [t]),
        'Fehler der Schemavalidierung. Was das Schema nicht kennt, blieb auch von der ' +
          'Profilprüfung unberührt.',
      );

    const buf = await wb.xlsx.writeBuffer();
    this.dl.download(
      dateiname(b),
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    this.toast.show('Prüfbericht als Excel exportiert.');
  }

  /** Kopfblatt: wogegen wurde geprüft, wie belastbar ist es, wie viel wurde gefunden. */
  private schreibeKopfblatt(wb: Workbook, b: Pruefbericht): void {
    const ws = wb.addWorksheet('Prüfbericht');
    const k = b.kopf;
    const abw = abweichungen(b);
    const erw = nachbeauftragt(b);

    ws.columns = [{ width: 34 }, { width: 88 }];
    this.titelzeile(ws, 'Prüfbericht: Testnachricht gegen Profilierung');

    const angaben: [string, string][] = [
      ['Testnachricht', k.name],
      ['Nachrichtentyp', k.msgName],
      ['XJustiz-Version', k.xjustizVersion ?? 'nicht ermittelbar'],
      ['Profilierung', k.profilName],
      ['Geprüfte Fassung', k.fassung],
      ['Geprüft am', new Date(k.zeitpunkt).toLocaleString('de-DE')],
      ['Schemavalidität', schemaText(k.schema)],
      [
        'Entscheidungsstand',
        k.fortschritt
          ? `${k.fortschritt.x} von ${k.fortschritt.y} Punkten entschieden`
          : `${k.festlegungen} Festlegungen (Stand dieser Fassung nicht mitgeführt)`,
      ],
      [
        'Benannte Vorkommen',
        k.vorkommenUnzuordenbar
          ? 'nicht zuordenbar — geprüft wurde die Anzahl, nicht die Zuordnung'
          : 'zugeordnet',
      ],
    ];
    for (const [a, b2] of angaben) this.paar(ws, a, b2);

    ws.addRow([]);
    this.titelzeile(ws, 'Befunde');
    this.paar(ws, 'Abweichungen der Nachricht', String(abw.length));
    // Die Aufschlüsselung sagt, *woran* es liegt — eine Summe allein nicht.
    for (const [art, n] of jeArt(abw)) this.paar(ws, `  davon ${ART_TEXT[art]}`, String(n));
    this.paar(ws, 'Lücken der Profilierung', String(b.luecken.length));
    this.paar(ws, 'Nachbeauftragte Elemente', String(erw.length));
    this.paar(ws, 'Schemafehler', String(k.schemaFehler.length));
  }

  private titelzeile(ws: Worksheet, text: string): void {
    const r = ws.addRow([text]);
    r.font = { ...XL_FONT, bold: true };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_HEADER } };
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_HEADER } };
  }

  private paar(ws: Worksheet, links: string, rechts: string): void {
    const r = ws.addRow([links, rechts]);
    r.font = XL_FONT;
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_KOPF } };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }

  /**
   * Ein Befund-Blatt: Erläuterung, Kopfzeile, Zeilen. Die Erläuterung steht
   * **im Blatt**, nicht nur im Kopfblatt — wer ein einzelnes Blatt ausdruckt
   * oder weiterschickt, muss die Zurechnung mitbekommen.
   */
  private schreibeBefundBlatt(
    wb: Workbook,
    name: string,
    spalten: string[],
    zeilen: string[][],
    erlaeuterung: string,
  ): void {
    // Excel begrenzt Blattnamen auf 31 Zeichen und verbietet einige Zeichen.
    const ws = wb.addWorksheet(name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    ws.columns = spalten.map((_, i) => ({ width: i === spalten.length - 1 ? 96 : 60 }));

    const hinweis = ws.addRow([erlaeuterung]);
    hinweis.font = { ...XL_FONT, italic: true };
    ws.addRow([]);

    const kopf = ws.addRow(spalten);
    kopf.font = { ...XL_FONT, bold: true };
    for (let i = 1; i <= spalten.length; i++)
      kopf.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_HEADER } };

    if (!zeilen.length) {
      const leer = ws.addRow(['— keine —']);
      leer.font = XL_FONT;
      return;
    }
    for (const z of zeilen) {
      const r = ws.addRow(z);
      r.font = XL_FONT;
      r.alignment = { wrapText: true, vertical: 'top' };
    }
    ws.autoFilter = {
      from: { row: kopf.number, column: 1 },
      to: { row: kopf.number + zeilen.length, column: spalten.length },
    };
  }
}

/** Anzahl je Verstossart, absteigend — nur Arten, die vorkommen. */
function jeArt(vs: Verstoss[]): [Verstoss['art'], number][] {
  const m = new Map<Verstoss['art'], number>();
  for (const v of vs) m.set(v.art, (m.get(v.art) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function schemaText(s: Pruefbericht['kopf']['schema']): string {
  if (s === 'valide') return 'valide';
  if (s === 'invalide') return 'nicht valide — Teile blieben ungeprüft';
  return 'nicht prüfbar — der Umfang der Prüfung ist unsicher';
}

/**
 * Sprechender Dateiname: Nachricht, Profilierung, Fassung, Datum. Er muss im
 * Anhang einer Mail ohne Öffnen sagen, was drinsteht.
 */
function dateiname(b: Pruefbericht): string {
  const sauber = (s: string): string =>
    s
      .replace(/\.xml$/i, '')
      .replace(/[^\wäöüÄÖÜß-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unbenannt';
  const d = new Date(b.kopf.zeitpunkt);
  const datum = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
  return `Pruefbericht_${sauber(b.kopf.name)}_${sauber(b.kopf.profilName)}_${sauber(b.kopf.fassung)}_${datum}.xlsx`;
}
