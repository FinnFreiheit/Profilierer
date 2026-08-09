import { TestBed } from '@angular/core/testing';
import { TestmessageGenerationService } from './testmessage-generation.service';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { XsdParserService } from './xsd-parser.service';
import { ProfileStoreService } from './profile-store.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { PersistenceService } from './persistence.service';
import { BundledSchemaService } from './bundled-schema.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';
import { XmlValidationService } from './xml-validation.service';
import { XsdDoc } from '../../models/xsd-index.model';
import { BundledVersion } from '../../models/schema-bundle.model';

/**
 * Vom Service ist nach Issue #35 der gemeinsame Baustein geblieben: das
 * Nachladen der passenden hinterlegten Schemaversion (`ensureSchema`). Den
 * Ein-Klick-Erzeuger gibt es nicht mehr — von der Profilierung zur
 * Testnachricht fuehrt genau ein Weg, der gefuehrte Durchlauf mit Bindung
 * (`TestmessageCreateService.neuAusProfil`, dort getestet).
 */
const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0001';

describe('TestmessageGenerationService', () => {
  let svc: TestmessageGenerationService;
  let state: StateService;
  /** ids, fuer die der Bundle-Loader angeworfen wurde. */
  let geladen: string[];

  beforeEach(() => {
    geladen = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: XmlValidationService, useValue: {} },
        { provide: ProfileStoreService, useValue: {} },
        { provide: TestmessageStoreService, useValue: {} },
        // Echte PersistenceService-Instanz vermeiden (effect/fetch im Konstruktor).
        {
          provide: PersistenceService,
          useValue: {
            flushAutosave: () => Promise.resolve(),
            loadXsdFiles: () => Promise.resolve(),
            loadBundle: (v: BundledVersion) => {
              geladen.push(v.id);
              return Promise.resolve(0);
            },
          },
        },
        {
          provide: BundledSchemaService,
          // Das Laden selbst laeuft ueber PersistenceService.loadBundle (oben
          // beobachtet); hier reicht eine leere Dateiliste.
          useValue: { files: () => Promise.resolve([] as XsdDoc[]) },
        },
        {
          provide: DownloadService,
          useValue: { download: () => {}, profilFilename: (e: string) => e },
        },
        { provide: ToastService, useValue: { show: () => {} } },
      ],
    });
    svc = TestBed.inject(TestmessageGenerationService);
    state = TestBed.inject(StateService);
    const tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    const idx = parser.buildIndexFrom(docs).idx;
    state.docs.set(docs);
    state.idx.set(idx);
    state.version.set('3.6.2');
    state.root.set(tree.buildRoot(M, idx));
    state.msgName.set(M);
    state.bundledVersions.set([{ id: '4.0.0', dir: '4.0.0', label: 'XJustiz 4.0.0', files: [] }]);
  });

  it('laedt die hinterlegte Version nach, wenn sie nicht die geladene ist', async () => {
    await svc.ensureSchema('4.0.0');
    expect(geladen).toEqual(['4.0.0']);
  });

  it('laesst das geladene Schema in Ruhe: gleiche Version, keine Angabe, unbekannte Version', async () => {
    await svc.ensureSchema('3.6.2');
    await svc.ensureSchema(undefined);
    await svc.ensureSchema('9.9.9');
    expect(geladen).toEqual([]);
  });
});
