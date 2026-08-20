import { TestBed } from '@angular/core/testing';
import { Testdaten } from './testdaten';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';
import { ERW_SPERRE_GRUND } from '../../core/util/erweiterung-sperre';
import { TestmessageEntry } from '../../models/testmessage.model';
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
