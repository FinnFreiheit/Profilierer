import { TestBed } from '@angular/core/testing';
import { ExcelExportService } from './excel-export.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { XsdParserService } from './xsd-parser.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';

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

describe('ExcelExportService (NGem-Layout)', () => {
  let svc: ExcelExportService;
  let state: StateService;
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
    expect(haupt).toContain('[choice]');
  });

  it('Szenariozelle: Statusname mit angehaengter Anmerkung; Testdaten aus Beispiel', async () => {
    state.setElementProfile(`${M2}/fachdaten/aktenzeichen`, {
      status: 's1', anmerkung: 'Wert 001', beispiel: '12345/2026',
    });
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('zwingend, Wert 001');
    expect(haupt).toContain('12345/2026');
  });

  it('Beschreibungszeile unter dem Element traegt "." als Fueller nur bei Statustext', async () => {
    const wb1 = await exportiert();
    const ws1 = wb1.getWorksheet('Notar an Gemeinde')!;
    let beschrZeile = 0;
    ws1.eachRow((row, nr) => {
      row.eachCell((c) => { if (String(c.value).startsWith('Das amtliche Aktenzeichen')) beschrZeile = nr; });
    });
    expect(beschrZeile).toBeGreaterThan(0);
    // Ohne Status: kein Fueller. Statusspalte = letzte Spalte - 1 (vor Testdaten).
    const colStatus = ws1.columnCount - 1;
    expect(ws1.getCell(beschrZeile, colStatus).value ?? '').toBe('');

    downloaded = [];
    state.setElementProfile(`${M2}/fachdaten/aktenzeichen`, { status: 's1' });
    const wb2 = await exportiert();
    const ws2 = wb2.getWorksheet('Notar an Gemeinde')!;
    expect(ws2.getCell(beschrZeile, colStatus).value).toBe('.');
  });

  it('Schema-Erweiterungen erscheinen mit [Erweiterung]-Typ in der Struktur', async () => {
    const id = state.addErweiterung(`${M2}/fachdaten`, {
      name: 'zusatzAngabe', beschreibung: 'Nachbeauftragung', min: '0', max: '1', datentyp: 'string',
    });
    state.addErweiterung(`${M2}/fachdaten/~${id}`, { name: 'unterFeld', min: '1', max: '1' });
    const wb = await exportiert();
    const haupt = inhalt(wb, 'Notar an Gemeinde');
    expect(haupt).toContain('zusatzAngabe');
    expect(haupt).toContain('[Erweiterung] string');
    expect(haupt).toContain('[Erweiterung] Container');
    expect(haupt).toContain('Nachbeauftragung'); // Beschreibung als desc-Zeile
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
