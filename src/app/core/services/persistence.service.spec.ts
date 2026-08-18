import { TestBed } from '@angular/core/testing';
import { PersistenceService } from './persistence.service';
import { ProfileStoreService } from './profile-store.service';
import { ToastService } from './toast.service';
import { StateService } from './state.service';
import { BundledSchemaService } from './bundled-schema.service';
import { DownloadService } from './download.service';
import { ProfileDoc } from '../../models/profile.model';
import { RolleService } from './rolle.service';
import { HinweisStoreService } from './hinweis-store.service';
import { HinweisEingabe } from '../util/hinweis.util';

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

describe('PersistenceService.loadBundle', () => {
  // Das 4.1.0-Paket von xjustiz.de: der Grunddatensatz traegt unveraendert
  // version="4.0.0" (nur Fachmodule sind gestiegen). Ohne Vorrang der
  // Paketversion hiesse die aktive Datenbasis 4.0.0.
  const BUNDLE_410 = { id: '4.1.0', label: '4.1.0', dir: 'xjustiz.de/4.1.0', files: [] };

  const setup = (): { svc: PersistenceService; state: StateService } => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BundledSchemaService,
          useValue: {
            files: async () => [
              new File([XSD_GDS_400], 'xjustiz_0000_grunddatensatz_4_0.xsd', {
                type: 'application/xml',
              }),
            ],
          },
        },
      ],
    });
    return { svc: TestBed.inject(PersistenceService), state: TestBed.inject(StateService) };
  };

  const XSD_GDS_400 = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="4.0.0">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

  it('setzt die Paketversion, nicht die aus dem Grunddatensatz gelesene', async () => {
    const { svc, state } = setup();
    await svc.loadBundle(BUNDLE_410);
    expect(state.version()).toBe('4.1.0');
    expect(state.activeBundle()).toBe('xjustiz.de/4.1.0');
  });

  // ensureSchema kam aus dem geloeschten TestmessageGenerationService: dessen
  // Interface bestand aus dieser einen Methode, der Rest war tot.
  describe('ensureSchema', () => {
    it('aktiviert die hinterlegte Version des Eintrags', async () => {
      const { svc, state } = setup();
      state.bundledVersions.set([BUNDLE_410]);
      state.version.set('3.6.2');

      await svc.ensureSchema('4.1.0');

      expect(state.version()).toBe('4.1.0');
      expect(state.activeBundle()).toBe('xjustiz.de/4.1.0');
    });

    it('laedt nicht neu, wenn die Version bereits aktiv ist', async () => {
      const { svc, state } = setup();
      state.bundledVersions.set([BUNDLE_410]);
      state.version.set('4.1.0');

      await svc.ensureSchema('4.1.0');

      expect(state.activeBundle()).toBeNull();
    });

    it('best effort: ohne Angabe und bei unbekannter Version bleibt das Schema', async () => {
      const { svc, state } = setup();
      state.bundledVersions.set([BUNDLE_410]);
      state.version.set('3.6.2');

      await svc.ensureSchema(undefined);
      await svc.ensureSchema('9.9.9');

      expect(state.version()).toBe('3.6.2');
      expect(state.activeBundle()).toBeNull();
    });
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
            // Bibliotheks-Index (Abnahme-Schreibschutz liest das Kennzeichen).
            entries: () => [],
            load: async () => geladen,
            upsert: async () => {},
            createVersion: async (
              id: string,
              opts?: { kommentar?: string; automatisch?: boolean },
            ) => {
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
        // Hinweise liegen in eigener Ablage; hier nicht der Pruefgegenstand.
        { provide: HinweisStoreService, useValue: { hinweise: () => [], lade: async () => {} } },
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

describe('PersistenceService Profildatei (Schema-Erweiterungen, Hinweise)', () => {
  let downloaded: { name: string; content: string }[];
  let createdDocs: ProfileDoc[];
  let ersetzt: { id: string; liste: HinweisEingabe[] }[];
  let svc: PersistenceService;

  beforeEach(() => {
    downloaded = [];
    createdDocs = [];
    ersetzt = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DownloadService,
          useValue: {
            download: (name: string, content: string) => downloaded.push({ name, content }),
          },
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
        {
          provide: HinweisStoreService,
          useValue: {
            hinweise: () => [],
            lade: async () => {},
            ersetzeAlle: async (id: string, liste: HinweisEingabe[]) =>
              void ersetzt.push({ id, liste }),
          },
        },
        { provide: ToastService, useValue: { show: () => {} } },
      ],
    });
    svc = TestBed.inject(PersistenceService);
    spyOn(svc, 'openFromLibrary').and.resolveTo();
  });

  const leer = (): ProfileDoc => ({
    meta: { name: 'P' },
    statuses: [],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
  });

  it('exportDoc schreibt formatVersion 4 inkl. erweiterungen', () => {
    svc.exportDoc({
      ...leer(),
      erweiterungen: {
        'm/a': [{ id: 'x1', name: 'zusatz', min: '1', max: '1', datentyp: 'string' }],
      },
    });
    const json = JSON.parse(downloaded[0]!.content);
    expect(json.formatVersion).toBe(4);
    expect(json.erweiterungen['m/a'][0].name).toBe('zusatz');
  });

  it('exportDoc legt die Hinweise unter einen eigenen Top-Level-Schluessel', () => {
    svc.exportDoc(leer(), [
      { id: 'h1', pfad: 'm/a', text: 'klaeren', autor: 'Anna', rolle: 'extern', zeit: 4242 },
    ]);
    const json = JSON.parse(downloaded[0]!.content);
    expect(json.elemente).toEqual({});
    expect(json.hinweise).toEqual([
      { pfad: 'm/a', text: 'klaeren', autor: 'Anna', rolle: 'extern', zeit: 4242 },
    ]);
  });

  it('Roundtrip: exportierte Hinweise werden beim Import wieder angelegt', async () => {
    svc.exportDoc(leer(), [
      { id: 'h1', pfad: 'm/a', text: 'klaeren', autor: 'Anna', rolle: 'extern', zeit: 4242 },
      { id: 'h2', pfad: 'm/b', text: 'erledigt', zeit: 4243, erledigt: true },
    ]);
    await svc.loadProfileFile(new File([downloaded[0]!.content], 'p.profil.json'));
    expect(ersetzt.length).toBe(1);
    expect(ersetzt[0]!.id).toBe('id1');
    const [a, b] = ersetzt[0]!.liste;
    expect(a).toEqual(
      jasmine.objectContaining({
        pfad: 'm/a',
        text: 'klaeren',
        autor: 'Anna',
        rolle: 'extern',
        zeit: 4242,
      }),
    );
    expect(a!.erledigt).toBeFalsy();
    expect(b).toEqual(
      jasmine.objectContaining({ pfad: 'm/b', text: 'erledigt', zeit: 4243, erledigt: true }),
    );
  });

  it('Altformat: hinweis-Felder im Dokument werden zu Listeneintraegen', async () => {
    const file = new File(
      [
        JSON.stringify({
          app: 'xjustiz-profilierer',
          formatVersion: 3,
          meta: { name: 'Alt' },
          statuses: [],
          elemente: {
            'm/a': { status: 's1', hinweis: 'Mit Registergericht klären' },
            'm/b': { hinweis: 'schon abgearbeitet', hinweisErledigt: true },
          },
          auspraegungen: {},
        }),
      ],
      'alt.profil.json',
    );
    await svc.loadProfileFile(file);
    // Das Dokument geht ohne die Altfelder an den Server; leere Eintraege fallen weg.
    expect(createdDocs[0]!.elemente).toEqual({ 'm/a': { status: 's1' } });
    expect(ersetzt[0]!.liste.map((h) => [h.pfad, h.text, !!h.erledigt])).toEqual([
      ['m/a', 'Mit Registergericht klären', false],
      ['m/b', 'schon abgearbeitet', true],
    ]);
    // Ohne mitgelieferten Zeitpunkt stempelt der Import selbst.
    expect(ersetzt[0]!.liste[0]!.zeit).toBeGreaterThan(0);
  });

  it('importiert v2-Dateien ohne erweiterungen-Feld als leere Map', async () => {
    const file = new File(
      [
        JSON.stringify({
          app: 'xjustiz-profilierer',
          formatVersion: 2,
          meta: { name: 'Alt' },
          statuses: [],
          elemente: { 'm/a': { status: 's1' } },
          auspraegungen: {},
        }),
      ],
      'alt.profil.json',
    );
    await svc.loadProfileFile(file);
    expect(createdDocs.length).toBe(1);
    expect(createdDocs[0]!.erweiterungen).toEqual({});
  });

  it('importiert v3-Dateien mit erweiterungen (Roundtrip)', async () => {
    const erweiterungen = { 'm/a': [{ id: 'x1', name: 'zusatz', min: '0', max: '1' }] };
    const file = new File(
      [
        JSON.stringify({
          app: 'xjustiz-profilierer',
          formatVersion: 3,
          meta: { name: 'Neu' },
          statuses: [],
          elemente: {},
          auspraegungen: {},
          erweiterungen,
        }),
      ],
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

describe('PersistenceService.openFromLibrary (Abnahme-Schreibschutz)', () => {
  let toasts: string[];
  let createVersionCalls: number;
  let agAktiv: boolean;

  const doc = (): ProfileDoc => ({
    meta: { name: 'Test', nachricht: 'nachricht.test.0001', xjustizVersion: '3.6.2' },
    statuses: [],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
  });

  const setup = (abgenommen: boolean): { svc: PersistenceService; state: StateService } => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProfileStoreService,
          useValue: {
            entries: () => [{ id: 'p1', abgenommen }],
            load: async () => doc(),
            upsert: async () => {},
            createVersion: async () => {
              createVersionCalls++;
              return { skipped: true };
            },
          },
        },
        { provide: ToastService, useValue: { show: (m: string) => toasts.push(m) } },
        { provide: RolleService, useValue: { agAktiv: () => agAktiv } },
        // Hinweise liegen in eigener Ablage; hier nicht der Pruefgegenstand.
        { provide: HinweisStoreService, useValue: { hinweise: () => [], lade: async () => {} } },
      ],
    });
    return { svc: TestBed.inject(PersistenceService), state: TestBed.inject(StateService) };
  };

  const laden = async (svc: PersistenceService): Promise<void> => {
    await svc.loadXsdFiles([new File([XSD], 'xjustiz_0000_test.xsd', { type: 'application/xml' })]);
  };

  beforeEach(() => {
    toasts = [];
    createVersionCalls = 0;
    agAktiv = false;
  });

  it('sperrt den Editor fuer Externe: readOnly, kein Oeffnen-Snapshot, Hinweis', async () => {
    const { svc, state } = setup(true);
    await laden(svc);
    await svc.openFromLibrary('p1');
    expect(state.abnahmeSchreibschutz()).toBeTrue();
    expect(state.readOnly()).toBeTrue();
    expect(createVersionCalls).toBe(0);
    expect(toasts.some((t) => t.includes('nur betrachten'))).toBeTrue();
  });

  it('AG-Rolle bearbeitet abgenommene Profile normal (mit Oeffnen-Snapshot)', async () => {
    agAktiv = true;
    const { svc, state } = setup(true);
    await laden(svc);
    await svc.openFromLibrary('p1');
    expect(state.abnahmeSchreibschutz()).toBeFalse();
    expect(state.readOnly()).toBeFalse();
    expect(createVersionCalls).toBe(1);
  });

  it('unmarkierte Profile bleiben fuer Externe editierbar', async () => {
    const { svc, state } = setup(false);
    await laden(svc);
    await svc.openFromLibrary('p1');
    expect(state.abnahmeSchreibschutz()).toBeFalse();
    expect(state.readOnly()).toBeFalse();
  });
});

/**
 * Der Wizard „Neue Profilierung" reicht Nachricht und Angaben durch: der
 * Bibliothekseintrag traegt sie sofort, und der Editor startet auf der
 * gewaehlten Nachricht statt leer.
 */
describe('PersistenceService.createNew (Vorgaben des Wizards)', () => {
  const XSD_MSG = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

  let svc: PersistenceService;
  let state: StateService;
  let createdDocs: ProfileDoc[];
  let toasts: string[];

  beforeEach(async () => {
    createdDocs = [];
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProfileStoreService,
          useValue: {
            create: async (doc: ProfileDoc) => {
              createdDocs.push(doc);
              return 'neu1';
            },
          },
        },
        { provide: ToastService, useValue: { show: (m: string) => toasts.push(m) } },
      ],
    });
    svc = TestBed.inject(PersistenceService);
    state = TestBed.inject(StateService);
    await svc.loadXsdFiles([
      new File([XSD_MSG], 'xjustiz_0000_test.xsd', { type: 'application/xml' }),
    ]);
  });

  it('legt mit Nachricht und Angaben an und oeffnet die Nachricht gefuehrt', async () => {
    await svc.createNew({
      nachricht: 'nachricht.test.0001',
      name: 'Szenario A',
      autor: 'BLK-AG',
      beschreibung: 'Testfall',
    });

    expect(createdDocs[0]!.meta).toEqual(
      jasmine.objectContaining({
        name: 'Szenario A',
        autor: 'BLK-AG',
        beschreibung: 'Testfall',
        nachricht: 'nachricht.test.0001',
        xjustizVersion: '3.6.2',
      }),
    );
    expect(state.activeProfileId()).toBe('neu1');
    expect(state.msgName()).toBe('nachricht.test.0001');
    // Die Nachrichtenwahl setzt das Profil zurueck — die Angaben ueberleben.
    expect(state.meta().name).toBe('Szenario A');
    expect(state.meta().autor).toBe('BLK-AG');
    expect(state.guided()).toBeTrue();
    expect(state.view()).toBe('editor');
    // Pflichtelemente sind wie bei der Nachrichtenwahl vorbelegt.
    expect(Object.keys(state.elemente()).length).toBeGreaterThan(0);
  });

  it('ohne Vorgaben bleibt es beim leeren Einstieg', async () => {
    await svc.createNew();
    expect(createdDocs[0]!.meta).toEqual({});
    expect(state.msgName()).toBeNull();
    expect(state.guided()).toBeTrue();
  });
});

describe('PersistenceService Autosave (Punktestand)', () => {
  /** Entprellung des Autosaves (800 ms) mit Reserve. */
  const NACH_ENTPRELLUNG = 900;

  /** Schema mit echten Entscheidungspunkten (optionales Element, Wiederholung). */
  const XSD_PUNKTE = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date"/>
    <xs:element name="spitzname" type="xs:string" minOccurs="0"/>
    <xs:element name="beteiligter" minOccurs="0" maxOccurs="unbounded"><xs:complexType><xs:sequence>
      <xs:element name="rolle" type="xs:string"/>
    </xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
</xs:schema>`;

  let upserted: ProfileDoc[];
  let svc: PersistenceService;
  let state: StateService;

  const doc = (over: Partial<ProfileDoc> = {}): ProfileDoc => ({
    meta: { name: 'Test', nachricht: 'nachricht.test.0001', xjustizVersion: '3.6.2' },
    statuses: [],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
    ...over,
  });

  /** Entprellung ablaufen lassen und den ausgeloesten Schreibvorgang abwarten. */
  async function entprellen(): Promise<void> {
    TestBed.tick(); // Effekt ausfuehren -> Timer planen
    jasmine.clock().tick(NACH_ENTPRELLUNG);
    await svc.flushAutosave();
  }

  /** Das zuletzt gesicherte Dokument (schlaegt fehl, wenn gar nichts lief). */
  function zuletzt(): ProfileDoc {
    const d = upserted.at(-1);
    if (!d) throw new Error('kein Autosave ausgeloest');
    return d;
  }

  const setup = async (geladen: ProfileDoc): Promise<void> => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProfileStoreService,
          useValue: {
            entries: () => [],
            load: async () => geladen,
            upsert: async (_id: string, d: ProfileDoc) => {
              upserted.push(d);
            },
            createVersion: async () => ({ skipped: true }),
          },
        },
        { provide: ToastService, useValue: { show: () => {} } },
        { provide: HinweisStoreService, useValue: { hinweise: () => [], lade: async () => {} } },
      ],
    });
    svc = TestBed.inject(PersistenceService);
    state = TestBed.inject(StateService);
    await svc.loadXsdFiles([
      new File([XSD_PUNKTE], 'xjustiz_0000_test.xsd', { type: 'application/xml' }),
    ]);
    await svc.openFromLibrary('p1');
  };

  beforeEach(() => {
    upserted = [];
    jasmine.clock().install();
  });

  afterEach(() => jasmine.clock().uninstall());

  it('behaelt den gespeicherten Punktestand, wenn er nicht neu gezaehlt werden kann', async () => {
    await setup(doc({ fortschritt: { x: 3, y: 9 } }));
    // Baum weg (z. B. Datenbasis ohne diese Nachricht), Nachricht bleibt gewaehlt.
    state.root.set(null);
    state.patchMeta({ beschreibung: 'geaendert' });
    await entprellen();
    // `profileDoc` fuehrt das Feld nicht — ohne Rueckfall verschwaende es hier.
    expect(zuletzt().fortschritt).toEqual({ x: 3, y: 9 });
  });

  it('zaehlt bei geladenem Baum neu und schreibt den eigenen Stand', async () => {
    await setup(doc({ fortschritt: { x: 3, y: 9 } }));
    state.patchMeta({ beschreibung: 'geaendert' });
    await entprellen();
    // Der frisch gezaehlte Stand ersetzt den geladenen.
    expect(zuletzt().fortschritt).toEqual({ x: 0, y: 2 });
  });
});
