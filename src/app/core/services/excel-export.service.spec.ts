import { TestBed } from '@angular/core/testing';
import { ExcelExportService } from './excel-export.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { XsdParserService } from './xsd-parser.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';
import { HinweisStoreService } from './hinweis-store.service';
import { Hinweis } from '../../models/profile.model';
import { hinweisDatum } from '../util/hinweis.util';

// ── Excel-Export im NGem-Abstimmungslayout ────────────────────────────

const XSD_NGEM = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0002" type="Type.Test.Nachricht"/>
  <xs:complexType name="Type.Test.Nachricht"><xs:sequence>
    <xs:element name="nachrichtenkopf" type="Type.GDS.Nachrichtenkopf"/>
    <xs:element name="fachdaten"><xs:complexType><xs:sequence>
      <xs:element name="aktenzeichen" type="xs:string" minOccurs="0">
        <xs:annotation><xs:documentation>Das amtliche Aktenzeichen.</xs:documentation></xs:annotation>
      </xs:element>
      <xs:choice>
        <xs:element name="zusage" type="xs:string"/>
        <xs:element name="absage" type="xs:string"/>
      </xs:choice>
    </xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.GDS.Nachrichtenkopf"><xs:sequence>
    <xs:element name="erstellungszeitpunkt" type="xs:dateTime"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M2 = 'nachricht.test.0002';

/** Ein Hinweis-Stub (Hinweise liegen im HinweisStoreService, nicht im Profil). */
const hw = (id: string, pfad: string, text: string): Hinweis => ({ id, pfad, text, zeit: 1000 });

describe('ExcelExportService (NGem-Layout)', () => {
  let svc: ExcelExportService;
  let state: StateService;
  let hinweise: HinweisStoreService;
  let downloaded: { name: string; content: BlobPart }[];

  beforeEach(() => {
    downloaded = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DownloadService,
          useValue: {
            download: (name: string, content: BlobPart) => downloaded.push({ name, content }),
            profilFilename: (ext: string) => 'test.' + ext,
          },
        },
        { provide: ToastService, useValue: { show: () => {} } },
      ],
    });
    svc = TestBed.inject(ExcelExportService);
    state = TestBed.inject(StateService);
    hinweise = TestBed.inject(HinweisStoreService);
    const tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD_NGEM, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx;
    state.idx.set(idx);
    state.root.set(tree.buildRoot(M2, idx));
    state.msgName.set(M2);
    state.version.set('3.6.2');
    state.meta.set({ name: 'Notar an Gemeinde', beschreibung: 'Vorkaufsrecht' });
  });

  /** Exportiert und liest die Arbeitsmappe wieder ein. */
  const exportiert = async () => {
    await svc.exportExcel();
    expect(downloaded.length).toBe(1);
    const mod = await import('exceljs');
    const Excel = (mod as { default?: typeof import('exceljs') }).default ?? mod;
    const wb = new Excel.Workbook();
    await wb.xlsx.load(downloaded[0]!.content as ArrayBuffer);
    return wb;
  };

  /** Alle Zellwerte eines Sheets als ein durchsuchbarer String. */
  const inhalt = (wb: import('exceljs').Workbook, sheet: string): string => {
    const ws = wb.getWorksheet(sheet)!;
    const teile: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => teile.push(String(c.value ?? ''))));
    return teile.join(' ');
  };

  it('bildet Hauptsheet, Typ-Sheet je GDS-Kind und Meta-Sheet (letztes)', async () => {
    const wb = await exportiert();
    const namen = wb.worksheets.map((w) => w.name);
    expect(namen[0]).toBe('Notar an Gemeinde');
    expect(namen).toContain('Type.GDS.Nachrichtenkopf');
    expect(namen[namen.length - 1]).toBe('Szenario');
  });

  it('kollabiert GDS-Kinder im Hauptsheet und klappt sie im Typ-Sheet aus', async () => {
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('nachrichtenkopf');
    expect(haupt).not.toContain('erstellungszeitpunkt');
    expect(haupt).toContain('fachdaten');
    expect(haupt).toContain('aktenzeichen');
    expect(inhalt(wb, 'Type.GDS.Nachrichtenkopf')).toContain('erstellungszeitpunkt');
  });

  it('Kopfbereich: Version, Profilname und Spaltenkoepfe wie in der Referenz', async () => {
    const wb = await exportiert();
    const ws = wb.getWorksheet('Notar an Gemeinde')!;
    expect(ws.getCell(1, 1).value).toBe('XJustiz-Version 3.6.2');
    expect(ws.getCell(2, 1).value).toBe(M2);
    expect(ws.getCell(3, 1).value).toBe('Kindelement');
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('Notar an Gemeinde\nVorkaufsrecht');
    expect(haupt).toContain('Testdaten\nNotar an Gemeinde');
    expect(haupt).not.toContain('[choice]'); // Auswahlknoten ohne Typ wie in der Referenz
  });

  it('Szenariozelle: Statusname mit angehaengter Anmerkung; Testdaten aus Beispiel', async () => {
    state.setElementProfile(`${M2}/fachdaten/aktenzeichen`, {
      status: 's1',
      anmerkung: 'Wert 001',
      beispiel: '12345/2026',
    });
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('zwingend, Wert 001');
    expect(haupt).toContain('12345/2026');
  });

  /** Zeilennummer der ersten Zelle, deren Wert mit `text` beginnt. */
  const zeileVon = (ws: import('exceljs').Worksheet, text: string): number => {
    let nr = 0;
    ws.eachRow((row, r) =>
      row.eachCell((c) => {
        if (!nr && String(c.value).startsWith(text)) nr = r;
      }),
    );
    return nr;
  };

  it('Beschreibungszeile bleibt in der Szenariospalte leer, auch mit Status', async () => {
    state.setElementProfile(`${M2}/fachdaten/aktenzeichen`, { status: 's1' });
    const wb = await exportiert();
    const ws = wb.getWorksheet('Notar an Gemeinde')!;
    const beschrZeile = zeileVon(ws, 'Das amtliche Aktenzeichen');
    expect(beschrZeile).toBeGreaterThan(0);
    // Statusspalte = letzte Spalte - 1 (vor Testdaten).
    const colStatus = ws.columnCount - 1;
    expect(ws.getCell(beschrZeile - 1, colStatus).value).toBe('zwingend');
    expect(ws.getCell(beschrZeile, colStatus).value ?? '').toBe('');
  });

  it('ohne Status keine Angabe: Anmerkung allein fuellt die Szenariospalte nicht', async () => {
    state.setElementProfile(`${M2}/fachdaten/aktenzeichen`, { anmerkung: 'nur notiert' });
    const wb = await exportiert();
    expect(inhalt(wb, 'Notar an Gemeinde')).not.toContain('nur notiert');
  });

  it('ausgeschlossenes Element: Zeile bleibt, Szenariospalte leer', async () => {
    state.setElementProfile(`${M2}/fachdaten/aktenzeichen`, {
      status: 's3',
      anmerkung: 'brauchen wir nicht',
    });
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('aktenzeichen');
    expect(haupt).not.toContain('nicht verwendet');
    expect(haupt).not.toContain('brauchen wir nicht');
  });

  it('Rahmen und verbundene Zellen wie in der Referenz', async () => {
    const wb = await exportiert();
    const ws = wb.getWorksheet('Notar an Gemeinde')!;
    // Struktur: fachdaten (Tiefe 0) > aktenzeichen, [choice] > zusage/absage → 3 Einrueckspalten.
    const fach = zeileVon(ws, 'fachdaten');
    const akt = zeileVon(ws, 'aktenzeichen');
    const zusage = zeileVon(ws, 'zusage');
    // Kopf "Kindelement" ueber alle Einrueckspalten.
    expect(ws.getCell(3, 3).master.address).toBe('A3');
    // Elementname bis vor die Typ-Spalte, ohne Typ auch ueber sie hinweg.
    expect(ws.getCell(fach, 4).master.address).toBe(`A${fach}`);
    expect(ws.getCell(akt, 3).master.address).toBe(`B${akt}`);
    expect(ws.getCell(akt, 4).master.address).toBe(`D${akt}`);
    // Einrueckspalte des Elternelements senkrecht ueber den Block.
    expect(ws.getCell(zusage, 1).master.address).toBe(`A${akt}`);
    // Gliederungsfarbe der Referenz: Ebene 0 Gruen (accent6, Tint 0,6) — auf
    // Name und Anzahl des Elternelements sowie senkrecht im Block.
    const farbe = (r: number, c: number) =>
      (ws.getCell(r, c).fill as { fgColor?: { argb?: string } }).fgColor?.argb;
    expect(farbe(fach, 1)).toBe('FFC5E0B4');
    expect(farbe(fach, 5)).toBe('FFC5E0B4');
    expect(farbe(akt, 1)).toBe('FFC5E0B4');
    // Spaltenbreite reicht fuer den Elementnamen (fett, ueber die Einrueckspalten).
    const breite = [1, 2, 3].reduce((w, c) => w + (ws.getColumn(c).width ?? 0), 0);
    expect(breite).toBeGreaterThanOrEqual('aktenzeichen'.length * 1.15);
    // Duenner Rahmen bis in die letzte Spalte.
    expect(ws.getCell(zusage, ws.columnCount).border?.bottom?.style).toBe('thin');
    expect(ws.getCell(3, 1).border?.top?.style).toBe('thin');
  });

  it('unter Ausschluss: Zeile bleibt, Szenariospalte leer, Status/Anmerkung/Testdaten unterdrueckt', async () => {
    state.setElementProfile(`${M2}/fachdaten`, { status: 's3' });
    state.setElementProfile(`${M2}/fachdaten/aktenzeichen`, {
      status: 's1',
      anmerkung: 'Wert 001',
      beispiel: '12345/2026',
    });
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('aktenzeichen'); // Strukturreferenz bleibt vollstaendig
    expect(haupt).not.toContain('nicht verwendet');
    expect(haupt).not.toContain('entfällt');
    expect(haupt).not.toContain('zwingend'); // schlummernder Status unterdrueckt
    expect(haupt).not.toContain('Wert 001');
    expect(haupt).not.toContain('12345/2026');
  });

  it('unter Ausschluss: auch Ausprägungs-Blöcke bleiben ohne gespeicherten Status', async () => {
    state.setElementProfile(`${M2}/fachdaten`, { status: 's3' });
    const id = state.addAusp(`${M2}/fachdaten/aktenzeichen`, 'Fall A');
    state.setElementProfile(`${M2}/fachdaten/aktenzeichen@${id}`, {
      status: 's1',
      beispiel: '99999/2026',
    });
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('aktenzeichen (Fall A)'); // Block bleibt als Strukturreferenz
    expect(haupt).not.toContain('entfällt');
    expect(haupt).not.toContain('zwingend');
    expect(haupt).not.toContain('99999/2026');
  });

  it('Schema-Erweiterungen erscheinen mit [Erweiterung]-Typ in der Struktur', async () => {
    const id = state.addErweiterung(`${M2}/fachdaten`, {
      name: 'zusatzAngabe',
      beschreibung: 'Nachbeauftragung',
      min: '0',
      max: '1',
      datentyp: 'string',
    });
    state.addErweiterung(`${M2}/fachdaten/~${id}`, { name: 'unterFeld', min: '1', max: '1' });
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('zusatzAngabe');
    expect(haupt).toContain('[Erweiterung] string');
    expect(haupt).toContain('[Erweiterung] Container');
    expect(haupt).toContain('Nachbeauftragung'); // Beschreibung als desc-Zeile
  });

  it('alle offenen Hinweise eines Elements stehen untereinander in einer Zelle', async () => {
    // Je Zeile die Herkunft: „Name (Rolle), Datum: Text" (#40). Ein Eintrag
    // ohne Autor (migrierter Altbestand) traegt nur sein Datum.
    hinweise.hinweise.set([
      {
        ...hw('h1', `${M2}/fachdaten/aktenzeichen`, 'Mit Registergericht klären'),
        autor: 'Müller',
        rolle: 'ag',
      },
      hw('h2', `${M2}/fachdaten/aktenzeichen`, 'Format noch offen'),
    ]);
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('Hinweise');
    const datum = hinweisDatum(1000);
    expect(haupt).toContain(
      `Müller (BLK-AG), ${datum}: Mit Registergericht klären\n${datum}: Format noch offen`,
    );
  });

  it('erledigte Hinweise werden nicht exportiert; ohne Hinweise keine Zusatzspalte', async () => {
    hinweise.hinweise.set([
      { ...hw('h1', `${M2}/fachdaten/aktenzeichen`, 'Mit Registergericht klären'), erledigt: true },
    ]);
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).not.toContain('Hinweise');
    expect(haupt).not.toContain('Mit Registergericht klären');
  });

  it('Meta-Sheet enthaelt Metadaten und die Statuslegende', async () => {
    const wb = await exportiert();
    const meta = inhalt(wb, 'Szenario');
    expect(meta).toContain('Notar an Gemeinde');
    expect(meta).toContain(M2);
    expect(meta).toContain('zwingend');
    expect(meta).toContain('darf nicht vorkommen');
  });
});
