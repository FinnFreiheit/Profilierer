import { TestBed } from '@angular/core/testing';
import { Testdaten } from './testdaten';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';
import { ERW_SPERRE_GRUND } from '../../core/util/erweiterung-sperre';
import { TestmessageEntry } from '../../models/testmessage.model';
import { AblagePatch } from '../../models/projekt.model';
import { TestmessagePatch } from '../../core/services/testmessage-store.service';

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
              return 'tm2';
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
    expect(toasts).toEqual(['Variante von „Ersuchen Gemeinde" angelegt.']);
  });

  it('meldet einen Fehlschlag, statt ihn zu verschlucken', async () => {
    scheitert = true;
    await td.variante(eintrag, new MouseEvent('click'));
    expect(dupliziert).toEqual([]);
    expect(toasts).toEqual(['Variante konnte nicht angelegt werden.']);
  });
});

/**
 * Einsortieren im Testdaten-Speicher (#134). Der Kern: eine an eine
 * Profilierung gebundene Nachricht **erbt** deren Projekt — der Dialog bietet
 * dafuer kein Feld an und schickt auch keins mit. Ein zweiter Pflegeort
 * erzeugte nur Widersprueche.
 */
describe('Testdaten — Einsortieren', () => {
  let td: {
    openAblage: (e: TestmessageEntry, ev: Event) => void;
    submitAblage: () => Promise<void>;
    ablProjekt: { (): string; set: (v: string) => void };
    ablTags: { (): string; set: (v: string) => void };
    ablGeerbtVon: () => string | undefined;
    nurProjekt: { set: (v: string) => void };
    gruppen: () => { items: TestmessageEntry[] }[];
  };
  let patches: { id: string; patch: AblagePatch }[];

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

  const gebunden = nachricht({ id: 'geb', profilId: 'p1', projektId: 'prj1', tags: ['Pilot'] });
  const upload = nachricht({ id: 'upl' });
  const verwaist = nachricht({ id: 'ver', profilId: 'geloescht' });

  beforeEach(async () => {
    patches = [];
    await TestBed.configureTestingModule({
      imports: [Testdaten],
      providers: [
        {
          provide: ProfileStoreService,
          useValue: { entries: () => [{ id: 'p1', name: 'Ersuchen an die Gemeinde' }] },
        },
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => [gebunden, upload, verwaist],
            refresh: async () => {},
            einsortieren: async (id: string, patch: AblagePatch) => {
              patches.push({ id, patch });
            },
          },
        },
        { provide: ToastService, useValue: { show: () => {}, showError: () => {} } },
      ],
    }).compileComponents();
    td = TestBed.createComponent(Testdaten).componentInstance as unknown as typeof td;
  });

  it('nennt die Profilierung, von der das Projekt geerbt wird', () => {
    td.openAblage(gebunden, new MouseEvent('click'));
    expect(td.ablGeerbtVon()).toBe('Ersuchen an die Gemeinde');
  });

  it('schickt bei geerbtem Projekt keine Zuordnung mit — nur die Schlagworte', async () => {
    td.openAblage(gebunden, new MouseEvent('click'));
    td.ablTags.set('Pilot, Schulung');
    await td.submitAblage();
    expect(patches).toEqual([
      { id: 'geb', patch: { projektId: undefined, tags: ['Pilot', 'Schulung'] } },
    ]);
  });

  it('laesst den Upload eigenstaendig zuordnen', async () => {
    td.openAblage(upload, new MouseEvent('click'));
    expect(td.ablGeerbtVon()).toBeUndefined();
    td.ablProjekt.set('prj1');
    await td.submitAblage();
    expect(patches).toEqual([{ id: 'upl', patch: { projektId: 'prj1', tags: [] } }]);
  });

  it('gibt die Nachricht einer geloeschten Profilierung wieder frei', () => {
    // Die Herkunft steht noch am Eintrag, die Profilierung nicht mehr in der
    // Bibliothek — dann erbt nichts mehr und die eigene Zuordnung ist der Weg.
    td.openAblage(verwaist, new MouseEvent('click'));
    expect(td.ablGeerbtVon()).toBeUndefined();
  });

  it('grenzt den Speicher auf ein Projekt ein', () => {
    const treffer = (): string[] => td.gruppen().flatMap((g) => g.items.map((e) => e.id));
    expect(treffer().length).toBe(3);
    td.nurProjekt.set('prj1');
    expect(treffer()).toEqual(['geb']);
  });
});
