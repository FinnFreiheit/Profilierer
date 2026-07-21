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
import { XmlValidationService, XmlValidierung } from './xml-validation.service';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';
import { TestmessageInput } from '../../models/testmessage.model';
import { XsdDoc } from '../../models/xsd-index.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0001';

const ENTRY = { id: 'lib1', name: 'Notar an Gemeinde' } as LibraryEntry;

function fixtureDoc(nachricht: string): ProfileDoc {
  return {
    meta: { name: 'Notar an Gemeinde', nachricht, xjustizVersion: '3.6.2' },
    statuses: [],
    elemente: { [`${M}/az`]: { beispiel: '4711' } },
    auspraegungen: {},
    erweiterungen: {},
  } as unknown as ProfileDoc;
}

describe('TestmessageGenerationService', () => {
  let svc: TestmessageGenerationService;
  let state: StateService;
  let created: TestmessageInput[];
  let notizen: { id: string; notiz?: string }[];
  let flushed: number;
  let profilDoc: ProfileDoc;
  /** Stub-Ergebnis der Schemavalidierung; Tests schalten um. */
  let pruefung: XmlValidierung;

  beforeEach(() => {
    created = [];
    notizen = [];
    flushed = 0;
    profilDoc = fixtureDoc(M);
    pruefung = { status: 'valide', fehler: [], fehlerDetails: [] };
    TestBed.configureTestingModule({
      providers: [
        { provide: XmlValidationService, useValue: { validiere: async () => pruefung } },
        { provide: ProfileStoreService, useValue: { load: () => Promise.resolve(profilDoc) } },
        {
          provide: TestmessageStoreService,
          useValue: {
            create: (input: TestmessageInput) => {
              created.push(input);
              return Promise.resolve('tm1');
            },
            updateMeta: (id: string, patch: { notiz?: string }) => {
              notizen.push({ id, ...patch });
              return Promise.resolve();
            },
          },
        },
        // Echte PersistenceService-Instanz vermeiden (effect/fetch im Konstruktor).
        { provide: PersistenceService, useValue: { flushAutosave: () => (++flushed, Promise.resolve()) } },
        { provide: BundledSchemaService, useValue: {} },
        { provide: DownloadService, useValue: { download: () => {}, profilFilename: (e: string) => e } },
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
  });

  /** "Vorheriger Editor": eigenes Profil samt Auswahl-/Aufklappzustand. */
  function praeparierePrevEditor(): {
    elemente: ReturnType<StateService['elemente']>;
    open: ReadonlySet<string>;
    root: ReturnType<StateService['root']>;
  } {
    state.setElementProfile(`${M}/kopf`, { anmerkung: 'vorher' });
    state.activeProfileId.set('prev');
    state.open.set(new Set([M, `${M}/kopf`]));
    return { elemente: state.elemente(), open: state.open(), root: state.root() };
  }

  it('erzeugt die Nachricht aus dem Profil und legt sie mit Herkunfts-Notiz ab', async () => {
    const id = await svc.erzeugeAusProfil(ENTRY);
    expect(id).toBe('tm1');
    expect(flushed).toBe(1);
    expect(created.length).toBe(1);
    const c = created[0]!;
    expect(c.name).toBe('Notar an Gemeinde — Beispiel.xml');
    expect(c.nachricht).toBe(M);
    expect(c.fachmodul).toBe('test');
    expect(c.xjustizVersion).toBe('3.6.2'); // aus doc.meta, nicht aus dem XML
    expect(c.xml).toContain(`<${M} xmlns=`);
    expect(c.xml).toContain('<az>4711</az>'); // Beispielwert des Profils
    expect(notizen[0]!.id).toBe('tm1');
    expect(notizen[0]!.notiz).toContain('Automatisch erzeugt aus Profilierung „Notar an Gemeinde"');
  });

  it('stellt den vorherigen Editor-Stand exakt wieder her (Referenzen)', async () => {
    const prev = praeparierePrevEditor();
    await svc.erzeugeAusProfil(ENTRY);
    expect(state.elemente()).toBe(prev.elemente);
    expect(state.open()).toBe(prev.open);
    expect(state.root()).toBe(prev.root);
    expect(state.msgName()).toBe(M);
    expect(state.activeProfileId()).toBe('prev');
  });

  it('wirft bei unbekannter Nachricht und restauriert trotzdem', async () => {
    profilDoc = fixtureDoc('nachricht.unbekannt.9999');
    const prev = praeparierePrevEditor();
    await expectAsync(svc.erzeugeAusProfil(ENTRY)).toBeRejectedWithError(/nicht im geladenen Schema/);
    expect(created.length).toBe(0);
    expect(state.elemente()).toBe(prev.elemente);
    expect(state.activeProfileId()).toBe('prev');
  });

  it('wirft, wenn das Profil keinen Nachrichtentyp hat', async () => {
    profilDoc = { ...fixtureDoc(M), meta: { name: 'ohne' } } as ProfileDoc;
    await expectAsync(svc.erzeugeAusProfil(ENTRY)).toBeRejectedWithError(/keinen Nachrichtentyp/);
  });

  it('nimmt Schema-Erweiterungen auf; nur Erweiterungs-Fehler machen keinen Entwurf', async () => {
    profilDoc = {
      ...fixtureDoc(M),
      erweiterungen: {
        [M]: [{ id: 'x1', name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' }],
      },
    } as ProfileDoc;
    pruefung = {
      status: 'invalide',
      fehler: ['nicht erwartet'],
      fehlerDetails: [{ text: "Element 'zusatzAngabe': This element is not expected.", zeile: 6 }],
    };
    await svc.erzeugeAusProfil(ENTRY);
    const c = created[0]!;
    expect(c.xml).toContain('<zusatzAngabe>');
    expect(c.entwurf).toBeFalse();
    expect(notizen[0]!.notiz).toContain('Schema-Erweiterungen');
  });

  it('echte Fehler machen weiterhin einen Entwurf', async () => {
    pruefung = {
      status: 'invalide',
      fehler: ['Zeile 5: kopf fehlt'],
      fehlerDetails: [{ text: 'Zeile 5: kopf fehlt', zeile: 5 }],
    };
    await svc.erzeugeAusProfil(ENTRY);
    expect(created[0]!.entwurf).toBeTrue();
  });
});
