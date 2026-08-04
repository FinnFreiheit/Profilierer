import { TestBed } from '@angular/core/testing';
import { Testdaten } from './testdaten';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';
import { ERW_SPERRE_GRUND } from '../../core/util/erweiterung-sperre';

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
