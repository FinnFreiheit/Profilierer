import { TestBed } from '@angular/core/testing';
import { PersistenceService } from './persistence.service';
import { ProfileStoreService } from './profile-store.service';
import { ToastService } from './toast.service';
import { StateService } from './state.service';
import { BundledSchemaService } from './bundled-schema.service';
import { DownloadService } from './download.service';
import { ProfileDoc } from '../../models/profile.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

describe('PersistenceService.loadXsdFiles', () => {
  let svc: PersistenceService;
  let state: StateService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(PersistenceService);
    state = TestBed.inject(StateService);
  });

  it('parst .xsd-Dateien, baut den Index und setzt den Store', async () => {
    const file = new File([XSD], 'xjustiz_0000_test.xsd', { type: 'application/xml' });
    const n = await svc.loadXsdFiles([file]);
    expect(n).toBe(1);
    expect(state.version()).toBe('3.6.2');
    expect(state.idx()!.messages.map((m) => m.name)).toEqual(['nachricht.test.0001']);
    expect(state.docs().length).toBe(1);
  });

  it('wirft bei fehlenden .xsd-Dateien', async () => {
    const other = new File(['x'], 'liste.xml', { type: 'text/xml' });
    await expectAsync(svc.loadXsdFiles([other])).toBeRejectedWithError(/Keine .xsd/);
  });
});

describe('PersistenceService.openFromLibrary (Versions-Angleich)', () => {
  const XSD_400 = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="4.0.0">
  <xs:element name="nachricht.neu.0002" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

  const BUNDLE_400 = { id: '4.0.0', label: '4.0.0', dir: '4.0.0', files: ['test.xsd'] };

  let toasts: string[];
  let filesCalls: number;
  let createVersionCalls: { id: string; opts?: { kommentar?: string; automatisch?: boolean } }[];
  let restoreDoc: ProfileDoc | null;

  const doc = (nachricht: string, xjustizVersion?: string): ProfileDoc => ({
    meta: { name: 'Test', nachricht, xjustizVersion },
    statuses: [],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
  });

  const setup = (geladen: ProfileDoc): { svc: PersistenceService; state: StateService } => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProfileStoreService,
          useValue: {
            load: async () => geladen,
            upsert: async () => {},
            createVersion: async (id: string, opts?: { kommentar?: string; automatisch?: boolean }) => {
              createVersionCalls.push({ id, opts });
              return { skipped: true };
            },
            restoreVersion: async () => {
              if (!restoreDoc) throw new Error('offline');
              return restoreDoc;
            },
          },
        },
        { provide: ToastService, useValue: { show: (m: string) => toasts.push(m) } },
        {
          provide: BundledSchemaService,
          useValue: {
            manifest: async () => [BUNDLE_400],
            files: async () => {
              filesCalls++;
              return [new File([XSD_400], 'xjustiz_0000_test.xsd', { type: 'application/xml' })];
            },
          },
        },
      ],
    });
    return { svc: TestBed.inject(PersistenceService), state: TestBed.inject(StateService) };
  };

  beforeEach(() => {
    toasts = [];
    filesCalls = 0;
    createVersionCalls = [];
    restoreDoc = null;
  });

  it('laedt die hinterlegte Profil-Version, wenn die Nachricht dort liegt (Bug: leerer Editor)', async () => {
    const { svc, state } = setup(doc('nachricht.neu.0002', '4.0.0'));
    state.bundledVersions.set([BUNDLE_400]);
    // Auto-Load-Zustand: 3.6.2 ist geladen, kennt die Nachricht nicht.
    await svc.loadXsdFiles([new File([XSD], 'xjustiz_0000_alt.xsd', { type: 'application/xml' })]);
    await svc.openFromLibrary('p1');
    expect(state.version()).toBe('4.0.0');
    expect(state.activeBundle()).toBe('4.0.0');
    expect(state.msgName()).toBe('nachricht.neu.0002');
    expect(state.root()).not.toBeNull();
    expect(toasts.some((t) => t.includes('nicht gefunden'))).toBeFalse();
  });

  it('laedt kein Bundle, wenn die Profil-Version bereits geladen ist', async () => {
    const { svc, state } = setup(doc('nachricht.test.0001', '3.6.2'));
    state.bundledVersions.set([BUNDLE_400]);
    await svc.loadXsdFiles([new File([XSD], 'xjustiz_0000_alt.xsd', { type: 'application/xml' })]);
    await svc.openFromLibrary('p1');
    expect(filesCalls).toBe(0);
    expect(state.msgName()).toBe('nachricht.test.0001');
  });

  it('unbekannte Version: bisheriges Verhalten (leerer Editor + Hinweis)', async () => {
    const { svc, state } = setup(doc('nachricht.fremd.0009', '9.9.9'));
    state.bundledVersions.set([BUNDLE_400]);
    await svc.loadXsdFiles([new File([XSD], 'xjustiz_0000_alt.xsd', { type: 'application/xml' })]);
    await svc.openFromLibrary('p1');
    expect(state.root()).toBeNull();
    expect(toasts.some((t) => t.includes('nicht gefunden'))).toBeTrue();
  });

  it('legt beim Oeffnen genau einen Auto-Snapshot an (US Versionieren)', async () => {
    const { svc } = setup(doc('nachricht.test.0001', '3.6.2'));
    await svc.loadXsdFiles([new File([XSD], 'xjustiz_0000_alt.xsd', { type: 'application/xml' })]);
    await svc.openFromLibrary('p1');
    expect(createVersionCalls).toEqual([
      { id: 'p1', opts: { automatisch: true, kommentar: 'Stand beim Öffnen' } },
    ]);
  });

  it('restoreVersion uebernimmt den Versionsstand — ohne Oeffnen-Snapshot', async () => {
    const { svc, state } = setup(doc('nachricht.test.0001', '3.6.2'));
    await svc.loadXsdFiles([new File([XSD], 'xjustiz_0000_alt.xsd', { type: 'application/xml' })]);
    await svc.openFromLibrary('p1');
    createVersionCalls = [];
    restoreDoc = {
      ...doc('nachricht.test.0001', '3.6.2'),
      meta: { name: 'Alter Stand', nachricht: 'nachricht.test.0001', xjustizVersion: '3.6.2' },
    };
    expect(await svc.restoreVersion('v1')).toBeTrue();
    expect(state.meta().name).toBe('Alter Stand');
    expect(state.msgName()).toBe('nachricht.test.0001');
    // Kein Oeffnen-Snapshot im Restore-Pfad — sonst entstuende sofort eine
    // weitere Automatik-Version (juengste Version = Sicherheits-Version).
    expect(createVersionCalls.length).toBe(0);
    expect(toasts.some((t) => t.includes('wiederhergestellt'))).toBeTrue();
  });

  it('restoreVersion: Backend-Fehler → Toast und false', async () => {
    const { svc } = setup(doc('nachricht.test.0001', '3.6.2'));
    await svc.loadXsdFiles([new File([XSD], 'xjustiz_0000_alt.xsd', { type: 'application/xml' })]);
    await svc.openFromLibrary('p1');
    restoreDoc = null;
    expect(await svc.restoreVersion('v1')).toBeFalse();
    expect(toasts.some((t) => t.includes('konnte nicht wiederhergestellt'))).toBeTrue();
  });

  it('restoreVersion ohne aktives Profil → false', async () => {
    const { svc } = setup(doc('nachricht.test.0001', '3.6.2'));
    expect(await svc.restoreVersion('v1')).toBeFalse();
  });
});

describe('PersistenceService Profildatei (formatVersion 3, Schema-Erweiterungen)', () => {
  let downloaded: { name: string; content: string }[];
  let createdDocs: ProfileDoc[];
  let svc: PersistenceService;

  beforeEach(() => {
    downloaded = [];
    createdDocs = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DownloadService,
          useValue: { download: (name: string, content: string) => downloaded.push({ name, content }) },
        },
        {
          provide: ProfileStoreService,
          useValue: {
            create: async (doc: ProfileDoc) => {
              createdDocs.push(doc);
              return 'id1';
            },
          },
        },
        { provide: ToastService, useValue: { show: () => {} } },
      ],
    });
    svc = TestBed.inject(PersistenceService);
    spyOn(svc, 'openFromLibrary').and.resolveTo();
  });

  it('exportDoc schreibt formatVersion 3 inkl. erweiterungen', () => {
    svc.exportDoc({
      meta: { name: 'P' },
      statuses: [],
      elemente: {},
      auspraegungen: {},
      erweiterungen: { 'm/a': [{ id: 'x1', name: 'zusatz', min: '1', max: '1', datentyp: 'string' }] },
    });
    const json = JSON.parse(downloaded[0]!.content);
    expect(json.formatVersion).toBe(3);
    expect(json.erweiterungen['m/a'][0].name).toBe('zusatz');
  });

  it('importiert v2-Dateien ohne erweiterungen-Feld als leere Map', async () => {
    const file = new File(
      [JSON.stringify({
        app: 'xjustiz-profilierer', formatVersion: 2, meta: { name: 'Alt' },
        statuses: [], elemente: { 'm/a': { status: 's1' } }, auspraegungen: {},
      })],
      'alt.profil.json',
    );
    await svc.loadProfileFile(file);
    expect(createdDocs.length).toBe(1);
    expect(createdDocs[0]!.erweiterungen).toEqual({});
  });

  it('importiert v3-Dateien mit erweiterungen (Roundtrip)', async () => {
    const erweiterungen = { 'm/a': [{ id: 'x1', name: 'zusatz', min: '0', max: '1' }] };
    const file = new File(
      [JSON.stringify({
        app: 'xjustiz-profilierer', formatVersion: 3, meta: { name: 'Neu' },
        statuses: [], elemente: {}, auspraegungen: {}, erweiterungen,
      })],
      'neu.profil.json',
    );
    await svc.loadProfileFile(file);
    expect(createdDocs[0]!.erweiterungen).toEqual(erweiterungen);
  });
});

describe('PersistenceService Notfallkopien', () => {
  const PREFIX = 'xjp.notfall.';
  const doc = (name: string): ProfileDoc => ({
    meta: { name },
    statuses: [],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
  });

  let upserted: { id: string; doc: ProfileDoc }[];
  let toasts: string[];
  let upsertOk: boolean;

  const clearNotfall = (): void => {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  };

  beforeEach(() => {
    upserted = [];
    toasts = [];
    upsertOk = true;
    clearNotfall();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProfileStoreService,
          useValue: {
            upsert: async (id: string, d: ProfileDoc) => {
              if (!upsertOk) throw new Error('offline');
              upserted.push({ id, doc: d });
            },
          },
        },
        { provide: ToastService, useValue: { show: (m: string) => toasts.push(m) } },
      ],
    });
  });

  afterEach(clearNotfall);

  it('traegt vorhandene Notfallkopien beim Start ans Backend nach und raeumt sie weg', async () => {
    localStorage.setItem(PREFIX + 'p1', JSON.stringify({ doc: doc('Eins'), ts: 1 }));
    localStorage.setItem(PREFIX + 'p2', JSON.stringify({ doc: doc('Zwei'), ts: 2 }));
    const svc = TestBed.inject(PersistenceService);
    await svc.flushNotfallkopien(); // Konstruktor-Flush laeuft parallel — Dedupe im Assert
    expect([...new Set(upserted.map((u) => u.id))].sort()).toEqual(['p1', 'p2']);
    expect(localStorage.getItem(PREFIX + 'p1')).toBeNull();
    expect(localStorage.getItem(PREFIX + 'p2')).toBeNull();
    expect(toasts.some((t) => t.includes('nachgetragen'))).toBeTrue();
  });

  it('behaelt Notfallkopien, solange das Backend nicht erreichbar ist', async () => {
    upsertOk = false;
    localStorage.setItem(PREFIX + 'p1', JSON.stringify({ doc: doc('Eins'), ts: 1 }));
    const svc = TestBed.inject(PersistenceService);
    await svc.flushNotfallkopien();
    expect(localStorage.getItem(PREFIX + 'p1')).not.toBeNull();
    expect(toasts.some((t) => t.includes('Notfallkopie vorhanden'))).toBeTrue();
  });

  it('ohne Notfallkopien: kein Nachtrag, kein Toast', async () => {
    const svc = TestBed.inject(PersistenceService);
    await svc.flushNotfallkopien();
    expect(upserted.length).toBe(0);
    expect(toasts.length).toBe(0);
  });
});
