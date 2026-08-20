import { TestBed } from '@angular/core/testing';
import { EinordnenDialog, PROJEKT_NEU } from './einordnen-dialog';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { EinordnenService } from '../../core/services/einordnen.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';
import { TestmessageEntry } from '../../models/testmessage.model';
import { AblagePatch, ProjektPatch } from '../../models/projekt.model';

/**
 * Der eine Einordnen-Dialog (#145). Er ersetzt drei Menuepunkte, die dasselbe
 * zu bedeuten schienen — geprueft wird, dass er beide Arten von Eintraegen
 * bedient und die Vererbungsregel einhaelt: eine Nachricht mit Szenario erbt
 * dessen Projekt und schickt keine eigene Zuordnung mit.
 */
describe('EinordnenDialog', () => {
  let dlg: {
    projektId: { (): string; set: (v: string) => void };
    neuerName: { set: (v: string) => void };
    szenarioId: { (): string; set: (v: string) => void };
    tags: { (): string; set: (v: string) => void };
    erbtVon: () => string | undefined;
    szenarien: () => LibraryEntry[];
    szenarioGebunden: () => boolean;
    passt: (e: LibraryEntry) => boolean;
    uebernimm: () => Promise<void>;
  };
  let profilPatches: { id: string; patch: AblagePatch }[];
  let tmPatches: { id: string; patch: AblagePatch }[];
  let zugeordnet: { id: string; profilId: string | null }[];
  let angelegt: ProjektPatch[];
  let fixture: ReturnType<typeof TestBed.createComponent<EinordnenDialog>>;

  const profil = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({ id: 'p', name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 0, ...over }) as LibraryEntry;

  const profile = [
    profil({ id: 'fremd', name: 'Aaa fremdes Modul', nachricht: 'nachricht.straf.anklage.1' }),
    profil({
      id: 'treffer',
      name: 'Zzz passender Typ',
      nachricht: 'nachricht.enova.entscheidung.3',
      projektId: 'prj1',
    }),
    profil({ id: 'ohne', name: 'Ohne Projekt', nachricht: 'nachricht.enova.antrag.2' }),
  ];

  const tm = (over: Partial<TestmessageEntry> = {}): TestmessageEntry =>
    ({
      id: 't1',
      name: 'upload.xml',
      nachricht: 'nachricht.enova.entscheidung.3',
      groesse: 0,
      hochgeladen: 0,
      aktualisiert: 0,
      ...over,
    }) as TestmessageEntry;

  const nachrichten = [
    tm(),
    tm({ id: 'gebunden', name: 'gefuehrt.xml', profilId: 'treffer', fassung: 'v2' }),
  ];

  beforeEach(async () => {
    profilPatches = [];
    tmPatches = [];
    zugeordnet = [];
    angelegt = [];
    await TestBed.configureTestingModule({
      imports: [EinordnenDialog],
      providers: [
        {
          provide: ProfileStoreService,
          useValue: {
            entries: () => profile,
            einsortieren: async (id: string, patch: AblagePatch) => {
              profilPatches.push({ id, patch });
            },
          },
        },
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => nachrichten,
            einsortieren: async (id: string, patch: AblagePatch) => {
              tmPatches.push({ id, patch });
            },
            zuordnen: async (id: string, profilId: string | null) => {
              zugeordnet.push({ id, profilId });
            },
          },
        },
        { provide: ToastService, useValue: { show: () => {}, showError: () => {} } },
      ],
    }).compileComponents();
    const projekte = TestBed.inject(ProjektStoreService);
    projekte.entries.set([
      { id: 'prj1', name: 'eNoVA', angelegt: 0, aktualisiert: 0, nProfile: 1, nTestnachrichten: 0 },
    ]);
    spyOn(projekte, 'refresh').and.resolveTo();
    spyOn(projekte, 'create').and.callFake(async (patch: ProjektPatch) => {
      angelegt.push(patch);
      return 'neu1';
    });
    fixture = TestBed.createComponent(EinordnenDialog);
    fixture.detectChanges();
    dlg = fixture.componentInstance as unknown as typeof dlg;
  });

  // Der Dialog fuellt seine Felder in einem effect — der laeuft erst im
  // naechsten Change-Detection-Zyklus.
  const oeffneProfil = (id: string): void => {
    TestBed.inject(EinordnenService).oeffneProfil(id);
    fixture.detectChanges();
  };
  const oeffneNachricht = (id: string): void => {
    TestBed.inject(EinordnenService).oeffneTestnachricht(id);
    fixture.detectChanges();
  };

  it('schreibt bei einer Profilierung nur Projekt und Schlagworte', async () => {
    oeffneProfil('ohne');
    dlg.projektId.set('prj1');
    dlg.tags.set('Pilot, pilot');
    await dlg.uebernimm();
    expect(profilPatches).toEqual([{ id: 'ohne', patch: { projektId: 'prj1', tags: ['Pilot'] } }]);
    expect(zugeordnet).toEqual([]);
  });

  it('legt ein neues Projekt an und ordnet in einem Zug zu', async () => {
    oeffneProfil('ohne');
    dlg.projektId.set(PROJEKT_NEU);
    dlg.neuerName.set('GenUVA');
    await dlg.uebernimm();
    expect(angelegt).toEqual([{ name: 'GenUVA' }]);
    expect(profilPatches[0]?.patch.projektId).toBe('neu1');
  });

  it('stellt bei einer Nachricht den passenden Nachrichtentyp nach oben', () => {
    oeffneNachricht('t1');
    expect(dlg.szenarien().map((e) => e.id)).toEqual(['treffer', 'ohne', 'fremd']);
    expect(dlg.passt(profile[1] as LibraryEntry)).toBeTrue();
  });

  it('schreibt Szenario und Ablage; das Projekt folgt dem Szenario', async () => {
    oeffneNachricht('t1');
    dlg.szenarioId.set('treffer');
    // Sobald ein Szenario gewaehlt ist, erbt die Nachricht dessen Projekt —
    // eine eigene Zuordnung wuerde der Server mit 409 abweisen.
    expect(dlg.erbtVon()).toBe('Zzz passender Typ');
    await dlg.uebernimm();
    expect(zugeordnet).toEqual([{ id: 't1', profilId: 'treffer' }]);
    expect(tmPatches).toEqual([{ id: 't1', patch: { projektId: undefined, tags: [] } }]);
  });

  it('laesst eine Nachricht ohne Szenario eigenstaendig zuordnen', async () => {
    oeffneNachricht('t1');
    expect(dlg.erbtVon()).toBeUndefined();
    dlg.projektId.set('prj1');
    await dlg.uebernimm();
    expect(zugeordnet).toEqual([]);
    expect(tmPatches).toEqual([{ id: 't1', patch: { projektId: 'prj1', tags: [] } }]);
  });

  it('ruehrt das Szenario einer gebundenen Nachricht nicht an', async () => {
    oeffneNachricht('gebunden');
    expect(dlg.szenarioGebunden()).toBeTrue();
    dlg.tags.set('Pilot');
    await dlg.uebernimm();
    // Die eingefrorene Fassung gehoert zu ihrer Profilierung; nur die
    // Schlagworte wandern.
    expect(zugeordnet).toEqual([]);
    expect(tmPatches[0]?.patch.tags).toEqual(['Pilot']);
  });

  it('fuellt die Felder aus dem Eintrag', () => {
    oeffneNachricht('gebunden');
    expect(dlg.szenarioId()).toBe('treffer');
  });
});
