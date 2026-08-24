import { TestBed } from '@angular/core/testing';
import { BundledSchemaService } from './bundled-schema.service';
import { RemoteSchemaService } from './remote-schema.service';
import { SchemaStoreService } from './schema-store.service';
import { BundledVersion, SchemaDatei } from '../../models/schema-bundle.model';

/**
 * Die Naht zwischen Ablage und Quelle: eine von xjustiz.de geholte Version wird
 * gespeichert und beim naechsten Mal von dort gelesen — nur so ueberlebt sie das
 * Neuladen der Seite. Frisch geholt wird ausschliesslich, was fehlt oder
 * ausdruecklich erneuert wird.
 */
describe('BundledSchemaService.files (Versionen von xjustiz.de)', () => {
  const V: BundledVersion = {
    id: '4.1.0',
    label: '4.1.0',
    dir: 'xjustiz.de/4.1.0',
    files: [],
    zipUrl: '/system/zip/XJustiz-4_1_0-XSD.zip',
  };

  let svc: BundledSchemaService;
  /** Antwort des Speichers auf `dateien` (null = nicht gespeichert). */
  let gespeichert: SchemaDatei[] | null;
  /** Was der Speicher entgegengenommen hat. */
  let gemerkt: { id: string; namen: string[] }[];
  /** Wie oft das ZIP von xjustiz.de geholt wurde. */
  let abrufe: number;
  /** Fehler beim Lesen des Speichers (Backend weg). */
  let speicherFaellt: boolean;

  beforeEach(() => {
    gespeichert = null;
    gemerkt = [];
    abrufe = 0;
    speicherFaellt = false;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SchemaStoreService,
          useValue: {
            entries: () => [],
            dateien: async (id: string) => {
              if (speicherFaellt) throw new Error('Backend weg');
              return id === V.id ? gespeichert : null;
            },
            merke: async (v: BundledVersion, files: SchemaDatei[]) => {
              gemerkt.push({ id: v.id, namen: files.map((f) => f.name) });
            },
          },
        },
        {
          provide: RemoteSchemaService,
          useValue: {
            dateien: async () => {
              abrufe++;
              return [{ name: 'frisch.xsd', text: '<neu/>' }];
            },
          },
        },
      ],
    });
    svc = TestBed.inject(BundledSchemaService);
  });

  it('holt eine unbekannte Version von xjustiz.de und legt sie ab', async () => {
    const files = await svc.files(V);

    expect(abrufe).toBe(1);
    expect(files.map((f) => f.name)).toEqual(['frisch.xsd']);
    expect(gemerkt).toEqual([{ id: '4.1.0', namen: ['frisch.xsd'] }]);
  });

  it('liest eine gespeicherte Version aus der Ablage, ohne xjustiz.de zu behelligen', async () => {
    gespeichert = [{ name: 'aus-der-ablage.xsd', text: '<alt/>' }];

    const files = await svc.files(V);

    expect(abrufe).toBe(0);
    expect(files.map((f) => f.name)).toEqual(['aus-der-ablage.xsd']);
    expect(await files[0]!.text()).toBe('<alt/>');
    expect(gemerkt).toEqual([]);
  });

  it('erneuern uebergeht die Ablage und ersetzt den gespeicherten Stand', async () => {
    gespeichert = [{ name: 'aus-der-ablage.xsd', text: '<alt/>' }];

    const files = await svc.files(V, { erneuern: true });

    expect(abrufe).toBe(1);
    expect(files.map((f) => f.name)).toEqual(['frisch.xsd']);
    expect(gemerkt).toEqual([{ id: '4.1.0', namen: ['frisch.xsd'] }]);
  });

  it('faellt bei unerreichbarer Ablage auf den Abruf zurueck', async () => {
    speicherFaellt = true;

    const files = await svc.files(V);

    expect(abrufe).toBe(1);
    expect(files.map((f) => f.name)).toEqual(['frisch.xsd']);
  });

  it('ruehrt fuer hinterlegte Versionen weder Ablage noch xjustiz.de an', async () => {
    // Ohne zipUrl kommen die Dateien aus public/schemas/ — hier nur gepruefft,
    // dass der Abrufweg gar nicht erst betreten wird (fetch schlaegt im Test fehl).
    await expectAsync(
      svc.files({ id: '3.6.2', label: '3.6.2', dir: '3.6.2', files: ['fehlt.xsd'] }),
    ).toBeRejected();
    expect(abrufe).toBe(0);
    expect(gemerkt).toEqual([]);
  });
});
