import { TestBed } from '@angular/core/testing';
import { SzenarioDialog } from './szenario-dialog';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { SzenarioZuordnenService } from '../../core/services/szenario-zuordnen.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';
import { TestmessageEntry } from '../../models/testmessage.model';

/**
 * "Szenario zuordnen" (#141). Der Wert steckt in der Reihenfolge: bei zwei
 * Dutzend Profilierungen ist eine unsortierte Liste Sucharbeit. Passende
 * Nachrichtentypen stehen oben, dann das Fachmodul, dann der Rest.
 */
describe('SzenarioDialog — Auswahl der Profilierung', () => {
  let dlg: {
    kandidaten: () => LibraryEntry[];
    passendeVorhanden: () => boolean;
    passt: (e: LibraryEntry) => boolean;
    gewaehlt: { (): string; set: (v: string) => void };
    suche: { set: (v: string) => void };
    uebernimm: () => Promise<void>;
    projektVon: (e: LibraryEntry) => string | undefined;
  };
  let zugeordnet: { id: string; profilId: string | null }[];

  const profil = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({ id: 'p', name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 0, ...over }) as LibraryEntry;

  const profile = [
    profil({ id: 'fremd', name: 'Aaa fremdes Modul', nachricht: 'nachricht.straf.anklage.1' }),
    profil({ id: 'modul', name: 'Zzz gleiches Modul', nachricht: 'nachricht.enova.antrag.2' }),
    profil({
      id: 'treffer',
      name: 'Zzz passender Typ',
      nachricht: 'nachricht.enova.entscheidung.3',
      projektId: 'prj1',
    }),
  ];

  const nachricht = {
    id: 't1',
    name: 'upload.xml',
    nachricht: 'nachricht.enova.entscheidung.3',
    groesse: 0,
    hochgeladen: 0,
    aktualisiert: 0,
  } as TestmessageEntry;

  beforeEach(async () => {
    zugeordnet = [];
    await TestBed.configureTestingModule({
      imports: [SzenarioDialog],
      providers: [
        { provide: ProfileStoreService, useValue: { entries: () => profile } },
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => [nachricht],
            zuordnen: async (id: string, profilId: string | null) => {
              zugeordnet.push({ id, profilId });
            },
          },
        },
        { provide: ToastService, useValue: { show: () => {}, showError: () => {} } },
      ],
    }).compileComponents();
    TestBed.inject(ProjektStoreService).entries.set([
      {
        id: 'prj1',
        name: 'eNoVA',
        angelegt: 0,
        aktualisiert: 0,
        nProfile: 1,
        nTestnachrichten: 0,
      },
    ]);
    spyOn(TestBed.inject(ProjektStoreService), 'refresh').and.resolveTo();
    const fixture = TestBed.createComponent(SzenarioDialog);
    fixture.detectChanges();
    dlg = fixture.componentInstance as unknown as typeof dlg;
    TestBed.inject(SzenarioZuordnenService).oeffne(nachricht);
    fixture.detectChanges();
  });

  it('stellt den passenden Nachrichtentyp nach oben, dann das Fachmodul', () => {
    // Trotz alphabetisch letztem Namen steht der Typ-Treffer vorn.
    expect(dlg.kandidaten().map((e) => e.id)).toEqual(['treffer', 'modul', 'fremd']);
    expect(dlg.passt(profile[2] as LibraryEntry)).toBeTrue();
    expect(dlg.passt(profile[0] as LibraryEntry)).toBeFalse();
    expect(dlg.passendeVorhanden()).toBeTrue();
  });

  it('nennt das Projekt, in das die Nachricht dadurch wandert', () => {
    expect(dlg.projektVon(profile[2] as LibraryEntry)).toBe('eNoVA');
    expect(dlg.projektVon(profile[0] as LibraryEntry)).toBeUndefined();
  });

  it('durchsucht Name und Nachrichtentyp', () => {
    dlg.suche.set('straf');
    expect(dlg.kandidaten().map((e) => e.id)).toEqual(['fremd']);
    dlg.suche.set('fremdes Modul');
    expect(dlg.kandidaten().map((e) => e.id)).toEqual(['fremd']);
  });

  it('ordnet die gewaehlte Profilierung zu', async () => {
    dlg.gewaehlt.set('treffer');
    await dlg.uebernimm();
    expect(zugeordnet).toEqual([{ id: 't1', profilId: 'treffer' }]);
  });

  it('hebt die Zuordnung auf, wenn nichts gewaehlt ist', async () => {
    dlg.gewaehlt.set('');
    await dlg.uebernimm();
    expect(zugeordnet).toEqual([{ id: 't1', profilId: null }]);
  });
});
