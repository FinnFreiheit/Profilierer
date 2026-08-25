import { TestBed } from '@angular/core/testing';
import { Testdaten } from './testdaten';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';
import { ERW_SPERRE_GRUND } from '../../core/util/erweiterung-sperre';
import { TestmessageEntry } from '../../models/testmessage.model';
import { EinordnenService } from '../../core/services/einordnen.service';
import { TestmessagePatch } from '../../core/services/testmessage-store.service';
import { TestmessageEditService } from '../../core/services/testmessage-edit.service';
import { XmlValidationService } from '../../core/services/xml-validation.service';
import { ValidationReportService } from '../../core/services/validation-report.service';
import { DownloadService } from '../../core/services/download.service';

/**
 * Testdaten-Speicher, Schritt "aus Profilierung" (#98): Profilierungen mit
 * Schema-Erweiterungen bleiben in der Liste, sind aber gesperrt.
 */
describe('Testdaten — Profilwahl bei Schema-Erweiterungen', () => {
  let td: {
    profilKandidaten: () => LibraryEntry[];
    erwSperre: (e: LibraryEntry) => boolean;
    chooseProfil: (e: LibraryEntry) => Promise<void>;
    createProfil: () => LibraryEntry | null;
  };
  let toasts: string[];

  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({
      id: 'p1',
      name: 'P',
      nachricht: 'nachricht.test.0001',
      nStatus: 0,
      nAusp: 0,
      aktualisiert: 0,
      ...over,
    }) as LibraryEntry;

  const bibliothek: LibraryEntry[] = [eintrag({ id: 'frei' }), eintrag({ id: 'mitErw', nErw: 2 })];

  beforeEach(async () => {
    toasts = [];
    await TestBed.configureTestingModule({
      imports: [Testdaten],
      providers: [
        { provide: ProfileStoreService, useValue: { entries: () => bibliothek } },
        {
          provide: TestmessageStoreService,
          useValue: { entries: () => [], refresh: async () => {} },
        },
        { provide: ToastService, useValue: { show: (t: string) => toasts.push(t) } },
      ],
    }).compileComponents();
    td = TestBed.createComponent(Testdaten).componentInstance as unknown as typeof td;
  });

  it('listet auch Profilierungen mit Erweiterungen — gesperrt statt unsichtbar', () => {
    expect(td.profilKandidaten().map((e) => e.id)).toEqual(['frei', 'mitErw']);
    expect(td.erwSperre(eintrag({ id: 'mitErw', nErw: 2 }))).toBeTrue();
    expect(td.erwSperre(eintrag({ id: 'frei' }))).toBeFalse();
  });

  it('waehlt eine gesperrte Profilierung auch bei direktem Aufruf nicht aus', async () => {
    await td.chooseProfil(eintrag({ id: 'mitErw', nErw: 2 }));
    expect(td.createProfil()).toBeNull();
    expect(toasts).toContain(ERW_SPERRE_GRUND);
  });
});

/**
 * Schlagwort-Filter des Testdaten-Speichers — dieselbe Geste wie in der
 * Profil-Uebersicht: mehrere gewaehlte Schlagworte grenzen zusammen ein (UND).
 */
describe('Testdaten — Filter nach Schlagworten', () => {
  let td: {
    gewaehlteTags: { set: (v: string[]) => void };
    verfuegbareTags: () => { tag: string; n: number }[];
    gruppen: () => { items: TestmessageEntry[] }[];
    search: { set: (v: string) => void };
    editTags: () => string;
    openEdit: (e: TestmessageEntry, ev: Event) => void;
  };
  let patches: { id: string; patch: TestmessagePatch }[];

  const nachricht = (over: Partial<TestmessageEntry> = {}): TestmessageEntry =>
    ({
      id: 'x',
      name: 'a.xml',
      nachricht: 'nachricht.test.0001',
      fachmodul: 'test',
      groesse: 10,
      hochgeladen: 0,
      aktualisiert: 0,
      ...over,
    }) as TestmessageEntry;

  const nachrichten = [
    nachricht({ id: 'a', tags: ['Pilot', 'eNoVA'] }),
    nachricht({ id: 'b', tags: ['Pilot'] }),
    nachricht({ id: 'c' }),
  ];

  const treffer = (): string[] => td.gruppen().flatMap((g) => g.items.map((e) => e.id));

  beforeEach(async () => {
    patches = [];
    await TestBed.configureTestingModule({
      imports: [Testdaten],
      providers: [
        { provide: ProfileStoreService, useValue: { entries: () => [] } },
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => nachrichten,
            refresh: async () => {},
            updateMeta: async (id: string, patch: TestmessagePatch) => {
              patches.push({ id, patch });
            },
          },
        },
        { provide: ToastService, useValue: { show: () => {} } },
      ],
    }).compileComponents();
    td = TestBed.createComponent(Testdaten).componentInstance as unknown as typeof td;
  });

  it('bietet die vergebenen Schlagworte mit Haeufigkeit an', () => {
    expect(td.verfuegbareTags()).toEqual([
      { tag: 'Pilot', n: 2 },
      { tag: 'eNoVA', n: 1 },
    ]);
  });

  it('grenzt ein; mehrere Schlagworte wirken zusammen', () => {
    expect(treffer()).toEqual(['a', 'b', 'c']);
    td.gewaehlteTags.set(['Pilot']);
    expect(treffer()).toEqual(['a', 'b']);
    td.gewaehlteTags.set(['Pilot', 'eNoVA']);
    expect(treffer()).toEqual(['a']);
  });

  it('findet Schlagworte auch ueber die Freitextsuche', () => {
    td.search.set('enova');
    expect(treffer()).toEqual(['a']);
  });

  it('fuellt den Bearbeiten-Dialog mit den Schlagworten der Nachricht', () => {
    td.openEdit(nachricht({ id: 'a', tags: ['Pilot', 'eNoVA'] }), new MouseEvent('click'));
    expect(td.editTags()).toBe('Pilot, eNoVA');
  });
});

/**
 * Kachel-Aktion "Variante anlegen" (#133): der Weg zur naechsten Auspraegung
 * eines Kommunikationsszenarios. Geprueft wird das beobachtbare Verhalten der
 * Komponente — dass sie dupliziert, den Klick nicht an die Kachel darunter
 * durchreicht und Erfolg wie Fehlschlag meldet.
 */
describe('Testdaten — Variante anlegen', () => {
  let td: {
    variante: (e: TestmessageEntry, ev: Event) => Promise<void>;
  };
  let dupliziert: string[];
  let toasts: string[];
  let scheitert: boolean;

  const eintrag = {
    id: 'tm1',
    name: 'Ersuchen Gemeinde',
    nachricht: 'nachricht.test.0001',
    fachmodul: 'test',
    groesse: 10,
    hochgeladen: 0,
    aktualisiert: 0,
  } as TestmessageEntry;

  beforeEach(async () => {
    dupliziert = [];
    toasts = [];
    scheitert = false;
    await TestBed.configureTestingModule({
      imports: [Testdaten],
      providers: [
        { provide: ProfileStoreService, useValue: { entries: () => [] } },
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => [eintrag],
            refresh: async () => {},
            dupliziere: async (id: string) => {
              if (scheitert) throw new Error('Backend weg');
              dupliziert.push(id);
              return {
                ...eintrag,
                id: 'tm2',
                name: 'Ersuchen Gemeinde (Variante)',
                profilId: 'p1',
                profilName: 'Ersuchen an die Gemeinde',
                fassung: 'Arbeitsstand vom 22.08.2026',
              } as TestmessageEntry;
            },
          },
        },
        {
          provide: ToastService,
          useValue: {
            show: (t: string) => toasts.push(t),
            showError: (_e: unknown, t: string) => toasts.push(t),
          },
        },
      ],
    }).compileComponents();
    td = TestBed.createComponent(Testdaten).componentInstance as unknown as typeof td;
  });

  it('dupliziert und meldet es, ohne die Kachel darunter zu oeffnen', async () => {
    const ev = new MouseEvent('click');
    spyOn(ev, 'stopPropagation');
    await td.variante(eintrag, ev);
    expect(dupliziert).toEqual(['tm1']);
    expect(ev.stopPropagation).toHaveBeenCalled();
    // Die Meldung nennt die gebundene Fassung — die Variante haengt am
    // aktuellen Stand der Profilierung, nicht zwingend an der des Originals.
    expect(toasts).toEqual([
      'Variante von „Ersuchen Gemeinde" angelegt — gebunden an „Ersuchen an die Gemeinde" (Arbeitsstand vom 22.08.2026).',
    ]);
  });

  it('meldet einen Fehlschlag, statt ihn zu verschlucken', async () => {
    scheitert = true;
    await td.variante(eintrag, new MouseEvent('click'));
    expect(dupliziert).toEqual([]);
    expect(toasts).toEqual(['Variante konnte nicht angelegt werden.']);
  });
});

/**
 * Einordnen (#145): der Testdaten-Speicher oeffnet nur noch den globalen
 * Dialog — Szenario, Projekt und Schlagworte liegen dort und werden in
 * `einordnen-dialog.spec.ts` geprueft. Hier bleibt der Projektfilter.
 */
describe('Testdaten — Projektfilter und Einordnen-Einstieg', () => {
  let td: {
    openAblage: (e: TestmessageEntry, ev: Event) => void;
    nurProjekt: { set: (v: string) => void };
    gruppen: () => { items: TestmessageEntry[] }[];
  };

  const nachricht = (over: Partial<TestmessageEntry> = {}): TestmessageEntry =>
    ({
      id: 'x',
      name: 'a.xml',
      nachricht: 'nachricht.genuva.ersuchen',
      fachmodul: 'genuva',
      groesse: 10,
      hochgeladen: 0,
      aktualisiert: 0,
      ...over,
    }) as TestmessageEntry;

  const gebunden = nachricht({ id: 'geb', profilId: 'p1', projektId: 'prj1' });
  const upload = nachricht({ id: 'upl' });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Testdaten],
      providers: [
        { provide: ProfileStoreService, useValue: { entries: () => [] } },
        {
          provide: TestmessageStoreService,
          useValue: { entries: () => [gebunden, upload], refresh: async () => {} },
        },
        { provide: ToastService, useValue: { show: () => {}, showError: () => {} } },
      ],
    }).compileComponents();
    td = TestBed.createComponent(Testdaten).componentInstance as unknown as typeof td;
  });

  it('grenzt den Speicher auf ein Projekt ein', () => {
    const treffer = (): string[] => td.gruppen().flatMap((g) => g.items.map((e) => e.id));
    expect(treffer().length).toBe(2);
    td.nurProjekt.set('prj1');
    expect(treffer()).toEqual(['geb']);
  });

  it('oeffnet den Einordnen-Dialog, ohne die Nachricht zu oeffnen', () => {
    const ev = new MouseEvent('click', { cancelable: true });
    spyOn(ev, 'stopPropagation');
    td.openAblage(upload, ev);
    expect(ev.stopPropagation).toHaveBeenCalled();
    expect(TestBed.inject(EinordnenService).ziel()).toEqual({ art: 'testnachricht', id: 'upl' });
  });
});

/**
 * Hochladen: eine Datei wird sofort im Baum geoeffnet (und noch nicht
 * abgelegt), mehrere wandern als Stapel in den Speicher.
 */
describe('Testdaten — Hochladen (Auswahlfeld wie Drag&Drop)', () => {
  let td: {
    onDrop: (files: File[]) => Promise<void>;
  };
  let geoeffnet: { xml: string; name: string }[];
  let angelegt: { name: string; entwurf?: boolean }[];
  /** Stub-Ergebnis der Schemavalidierung; Tests schalten um. */
  let pruefung: { status: string; fehler: string[]; fehlerDetails: never[] };

  const XML = (n: string): string =>
    `<?xml version="1.0"?><nachricht.genuva.ersuchen xmlns="http://www.xjustiz.de">` +
    `<x>${n}</x></nachricht.genuva.ersuchen>`;

  const datei = (name: string, inhalt = XML(name)): File =>
    new File([inhalt], name, { type: 'application/xml' });

  beforeEach(async () => {
    geoeffnet = [];
    angelegt = [];
    pruefung = { status: 'valide', fehler: [], fehlerDetails: [] };
    await TestBed.configureTestingModule({
      imports: [Testdaten],
      providers: [
        { provide: ProfileStoreService, useValue: { entries: () => [] } },
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => [],
            refresh: async () => {},
            create: async (input: { name: string; entwurf?: boolean }) => {
              angelegt.push({ name: input.name, entwurf: input.entwurf });
              return 'neu';
            },
          },
        },
        { provide: ToastService, useValue: { show: () => {}, showError: () => {} } },
        {
          provide: TestmessageEditService,
          useValue: {
            oeffneHochgeladen: async (xml: string, name: string) => {
              geoeffnet.push({ xml, name });
            },
          },
        },
        { provide: XmlValidationService, useValue: { validiere: async () => pruefung } },
        { provide: ValidationReportService, useValue: { zeige: () => {} } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Testdaten);
    fixture.detectChanges(); // der Upload-Dialog wird geschlossen — er muss existieren
    td = fixture.componentInstance as unknown as typeof td;
  });

  it('oeffnet eine einzelne Nachricht sofort, ohne sie abzulegen', async () => {
    await td.onDrop([datei('upload.xml')]);
    expect(geoeffnet.map((g) => g.name)).toEqual(['upload.xml']);
    expect(angelegt).toEqual([]);
  });

  it('legt mehrere Dateien als Stapel ab, ohne eine davon zu oeffnen', async () => {
    await td.onDrop([datei('a.xml'), datei('b.xml')]);
    expect(angelegt.map((e) => e.name)).toEqual(['a.xml', 'b.xml']);
    expect(geoeffnet).toEqual([]);
  });

  it('ignoriert einen Ablagevorgang ohne Dateien', async () => {
    await td.onDrop([]);
    expect(angelegt).toEqual([]);
    expect(geoeffnet).toEqual([]);
  });

  // Regeländerung: invalide Nachrichten duerfen in den Speicher. Abgewiesen
  // wird nur, was gar keine XJustiz-Nachricht ist.
  it('legt nicht schema-valide Nachrichten als Entwurf ab, statt sie abzuweisen', async () => {
    pruefung = { status: 'invalide', fehler: ['Zeile 2: falsch'], fehlerDetails: [] };
    await td.onDrop([datei('kaputt.xml'), datei('auch-kaputt.xml')]);
    expect(angelegt).toEqual([
      { name: 'kaputt.xml', entwurf: true },
      { name: 'auch-kaputt.xml', entwurf: true },
    ]);
  });

  it('kennzeichnet valide Nachrichten des Stapels nicht als Entwurf', async () => {
    await td.onDrop([datei('a.xml'), datei('b.xml')]);
    expect(angelegt.every((e) => e.entwurf === false)).toBeTrue();
  });

  it('weist weiterhin ab, was keine XJustiz-Nachricht ist', async () => {
    await td.onDrop([datei('liste.xml', '<gc:CodeList/>'), datei('gut.xml')]);
    expect(angelegt.map((e) => e.name)).toEqual(['gut.xml']);
  });
});

/**
 * Regeländerung: der Download hat kein Validitäts-Tor mehr. Früher blockierte
 * eine gescheiterte Schemaprüfung die eigene Datei — gerade in den Fällen, die
 * man weiterreichen will (Negativtest, Fehlerbeispiel für den Hersteller).
 */
describe('Testdaten — Download', () => {
  let td: { download: (e: TestmessageEntry, ev: Event) => Promise<void> };
  let geladen: { name: string; inhalt: string }[];
  let geprueft: number;

  const nachricht = (over: Partial<TestmessageEntry> = {}): TestmessageEntry =>
    ({
      id: 'x',
      name: 'a.xml',
      nachricht: 'nachricht.genuva.ersuchen',
      fachmodul: 'genuva',
      groesse: 10,
      hochgeladen: 0,
      aktualisiert: 0,
      ...over,
    }) as TestmessageEntry;

  beforeEach(async () => {
    geladen = [];
    geprueft = 0;
    await TestBed.configureTestingModule({
      imports: [Testdaten],
      providers: [
        { provide: ProfileStoreService, useValue: { entries: () => [] } },
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => [],
            refresh: async () => {},
            loadXml: async () => '<nachricht.genuva.ersuchen/>',
          },
        },
        { provide: ToastService, useValue: { show: () => {}, showError: () => {} } },
        {
          provide: DownloadService,
          useValue: {
            xmlFilename: (n: string) => n,
            download: (name: string, inhalt: string) => geladen.push({ name, inhalt }),
          },
        },
        {
          provide: XmlValidationService,
          useValue: {
            validiere: async () => {
              geprueft++;
              return { status: 'invalide', fehler: ['Zeile 2: falsch'], fehlerDetails: [] };
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Testdaten);
    fixture.detectChanges();
    td = fixture.componentInstance as unknown as typeof td;
  });

  it('laedt auch einen Entwurf herunter — und prueft dafuer gar nicht erst', async () => {
    await td.download(nachricht({ entwurf: true }), new MouseEvent('click'));
    expect(geladen.map((g) => g.name)).toEqual(['a.xml']);
    expect(geprueft).toBe(0);
  });

  it('laedt eine unauffaellige Nachricht unveraendert herunter', async () => {
    await td.download(nachricht(), new MouseEvent('click'));
    expect(geladen).toEqual([{ name: 'a.xml', inhalt: '<nachricht.genuva.ersuchen/>' }]);
  });
});
