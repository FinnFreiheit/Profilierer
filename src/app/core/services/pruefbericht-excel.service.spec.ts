import { TestBed } from '@angular/core/testing';
import type { Workbook } from 'exceljs';
import { PruefberichtExcelService } from './pruefbericht-excel.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';
import { Pruefbericht, PruefberichtKopf } from '../../models/pruefbericht.model';

/**
 * Der Excel-Pruefbericht wird **gelesen** geprueft: die erzeugte Mappe wird
 * zurueckgeparst. Das haelt die Zurechnung fest (welcher Befund auf welchem
 * Blatt) — sie ist der Zweck der Trennung, und ein Blatt, das man einzeln
 * weiterschickt, muss sie mitbringen.
 */
describe('PruefberichtExcelService', () => {
  let svc: PruefberichtExcelService;
  let dateien: { name: string; content: BlobPart }[];

  const kopf = (teile: Partial<PruefberichtKopf> = {}): PruefberichtKopf => ({
    name: 'lieferung.xml',
    msgName: 'nachricht.test.0001',
    profilName: 'Testprofil',
    fassung: 'v4 (Freigabe)',
    xjustizVersion: '3.6.2',
    zeitpunkt: Date.parse('2026-08-11T10:00:00Z'),
    schema: 'valide',
    schemaFehler: [],
    festlegungen: 236,
    nErweiterung: 0,
    reichweite: { gesamt: 236, ungeprueft: 0 },
    vorkommenUnzuordenbar: false,
    ...teile,
  });

  const bericht = (teile: Partial<Pruefbericht> = {}): Pruefbericht => ({
    kopf: kopf(),
    verstoesse: [],
    luecken: [],
    zuordnung: [],
    kennzeichenLage: [],
    ...teile,
  });

  beforeEach(() => {
    dateien = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DownloadService,
          useValue: {
            download: (name: string, content: BlobPart) => dateien.push({ name, content }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    svc = TestBed.inject(PruefberichtExcelService);
  });

  /** Die erzeugte Mappe zurueckparsen. */
  async function mappe(b: Pruefbericht): Promise<Workbook> {
    await svc.exportiere(b);
    const mod = await import('exceljs');
    const Excel = (mod as { default?: typeof import('exceljs') }).default ?? mod;
    const wb = new Excel.Workbook();
    await wb.xlsx.load(dateien[0]!.content as ArrayBuffer);
    return wb;
  }

  /** Alle Zellwerte eines Blattes als Zeilen von Strings. */
  function zeilen(wb: Workbook, blatt: string): string[][] {
    const ws = wb.getWorksheet(blatt)!;
    const out: string[][] = [];
    ws.eachRow((r) => {
      const werte: string[] = [];
      r.eachCell({ includeEmpty: true }, (c) => werte.push(String(c.value ?? '')));
      out.push(werte);
    });
    return out;
  }

  it('legt Kopfblatt und je Befundart ein Blatt an', async () => {
    const wb = await mappe(
      bericht({
        verstoesse: [{ pfad: 'm/az', art: 'wert', text: 'nicht freigegeben' }],
        luecken: [{ pfad: 'm/art', wert: '007', text: 'keine Festlegung' }],
      }),
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Prüfbericht',
      'Abweichungen',
      'Lücken der Profilierung',
    ]);
  });

  it('nennt im Kopfblatt Fassung, Zeitpunkt und die Zählungen je Art', async () => {
    const wb = await mappe(
      bericht({
        verstoesse: [
          { pfad: 'm/a', art: 'wert', text: 't' },
          { pfad: 'm/b', art: 'wert', text: 't' },
          { pfad: 'm/c', art: 'fehlt', text: 't' },
        ],
      }),
    );
    const flach = zeilen(wb, 'Prüfbericht')
      .map((z) => z.join(' | '))
      .join('\n');

    expect(flach).toContain('Geprüfte Fassung | v4 (Freigabe)');
    expect(flach).toContain('Profilierung | Testprofil');
    expect(flach).toContain('Geprüft am | ');
    expect(flach).toContain('Abweichungen der Nachricht | 3');
    expect(flach).toContain('davon Wert | 2');
    expect(flach).toContain('davon fehlt | 1');
  });

  it('trägt die Zurechnung in jedem Blatt, nicht nur im Kopfblatt', async () => {
    const wb = await mappe(bericht({ luecken: [{ pfad: 'm/a', wert: 'x', text: 't' }] }));
    expect(zeilen(wb, 'Lücken der Profilierung')[0]![0]).toContain(
      'Mangel der Profilierung, nicht der Nachricht',
    );
  });

  it('führt nachbeauftragte Elemente auf eigenem Blatt und nicht bei den Abweichungen', async () => {
    const wb = await mappe(
      bericht({
        kopf: kopf({ nErweiterung: 1 }),
        verstoesse: [
          { pfad: 'm/az', art: 'fehlt', text: 'echt' },
          { pfad: 'm/~x1/feld', art: 'fehlt', text: 'nachbeauftragt', erweiterung: true },
        ],
      }),
    );
    const abw = zeilen(wb, 'Abweichungen')
      .map((z) => z.join(' '))
      .join('\n');
    expect(abw).toContain('m/az');
    expect(abw).not.toContain('m/~x1/feld');

    const erw = zeilen(wb, 'Nachbeauftragte Elemente')
      .map((z) => z.join(' '))
      .join('\n');
    expect(erw).toContain('m/~x1/feld');
    expect(erw).toContain('gültige Nachricht kann sie nicht enthalten');
  });

  it('schreibt ein Schemafehler-Blatt nur, wenn es Fehler gibt', async () => {
    const ohne = await mappe(bericht());
    expect(ohne.getWorksheet('Schemafehler')).toBeUndefined();

    dateien = [];
    const mit = await mappe(
      bericht({ kopf: kopf({ schema: 'invalide', schemaFehler: ['Zeile 3: kaputt'] }) }),
    );
    expect(zeilen(mit, 'Schemafehler').flat()).toContain('Zeile 3: kaputt');
  });

  it('sagt in einem leeren Befundblatt „keine" statt nichts', async () => {
    const wb = await mappe(bericht());
    expect(zeilen(wb, 'Abweichungen').flat()).toContain('— keine —');
  });

  it('baut einen sprechenden Dateinamen mit Nachricht, Profil, Fassung und Datum', async () => {
    await svc.exportiere(bericht());
    expect(dateien[0]!.name).toBe('Pruefbericht_lieferung_Testprofil_v4_Freigabe_2026-08-11.xlsx');
  });
});
