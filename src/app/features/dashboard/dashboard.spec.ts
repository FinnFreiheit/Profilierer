import { TestBed } from '@angular/core/testing';
import { ProfilMetaPatch, ProfileStoreService } from '../../core/services/profile-store.service';
import { Dashboard } from './dashboard';
import { LibraryEntry } from '../../models/profile.model';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { AblagePatch, ProjektPatch } from '../../models/projekt.model';
import { PROJEKT_NEU } from '../../shared/einsortieren/einsortieren';
import { ERW_SPERRE_GRUND } from '../../core/util/erweiterung-sperre';

/**
 * Fortschrittsbalken der Kachel (#93). Der Nenner kommt aus dem Stand der
 * Entscheidungspunkte, den der Client beim Speichern mitschreibt — fehlt er
 * (Altbestand), zeigt die Kachel keinen Balken statt einen erfundenen.
 */
describe('Dashboard — Fortschritt auf der Kachel', () => {
  let dash: {
    anteil: (e: LibraryEntry) => number | null;
    fortschritt: (e: LibraryEntry) => string;
    anteilText: (e: LibraryEntry) => string;
  };

  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({ id: 'x', name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 0, ...over }) as LibraryEntry;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();
    const fixture = TestBed.createComponent(Dashboard);
    dash = fixture.componentInstance as unknown as typeof dash;
  });

  it('rechnet den Anteil aus entschiedenen und gesamten Punkten', () => {
    expect(dash.anteil(eintrag({ nEntschieden: 12, nPunkte: 40 }))).toBeCloseTo(0.3);
    expect(dash.fortschritt(eintrag({ nEntschieden: 12, nPunkte: 40 }))).toBe(
      '12 von 40 entschieden',
    );
    expect(dash.anteilText(eintrag({ nEntschieden: 12, nPunkte: 40 }))).toBe('30 % entschieden');
  });

  it('liefert 0 statt null, wenn noch nichts entschieden ist', () => {
    // Wichtig fuer das Template: 0 ist falsy, darf den Balken aber nicht
    // verschwinden lassen — ein frisch begonnenes Profil zeigt einen leeren.
    expect(dash.anteil(eintrag({ nEntschieden: 0, nPunkte: 479 }))).toBe(0);
    expect(dash.fortschritt(eintrag({ nEntschieden: 0, nPunkte: 479 }))).toBe(
      '0 von 479 entschieden',
    );
  });

  it('zeigt bei vollstaendiger Entscheidung 100 Prozent', () => {
    expect(dash.anteil(eintrag({ nEntschieden: 40, nPunkte: 40 }))).toBe(1);
  });

  it('kennt keinen Anteil ohne mitgeschriebenen Stand', () => {
    expect(dash.anteil(eintrag({ nStatus: 360 }))).toBeNull();
    expect(dash.anteil(eintrag({ nEntschieden: 5 }))).toBeNull();
    expect(dash.anteil(eintrag({ nPunkte: 0, nEntschieden: 0 }))).toBeNull();
  });

  it('faellt im Altbestand auf die Festlegungen zurueck', () => {
    expect(dash.fortschritt(eintrag({ nStatus: 360, nAusp: 4 }))).toBe(
      '360 Festlegungen · 4 Ausprägungen',
    );
    expect(dash.fortschritt(eintrag())).toBe('noch leer');
  });
});

/**
 * Sperre der Testnachricht-Erstellung an der Kachel (#98). Der Eintrag bleibt
 * sichtbar und gesperrt — ein verschwundener Menuepunkt waere ein Raetsel.
 */
describe('Dashboard — Testnachricht bei Schema-Erweiterungen', () => {
  let dash: {
    erwSperre: (e: LibraryEntry) => boolean;
    testnachrichtTitel: (e: LibraryEntry) => string;
  };

  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({ id: 'x', name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 0, ...over }) as LibraryEntry;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();
    dash = TestBed.createComponent(Dashboard).componentInstance as unknown as typeof dash;
  });

  it('sperrt jede Profilierung mit Erweiterungen und nennt den Grund', () => {
    expect(dash.erwSperre(eintrag({ nErw: 1 }))).toBeTrue();
    expect(dash.testnachrichtTitel(eintrag({ nErw: 1 }))).toBe(ERW_SPERRE_GRUND);
  });

  it('laesst Profilierungen ohne Erweiterungen unveraendert', () => {
    expect(dash.erwSperre(eintrag({ nErw: 0 }))).toBeFalse();
    expect(dash.erwSperre(eintrag())).toBeFalse();
    expect(dash.testnachrichtTitel(eintrag())).toContain('geführter Durchlauf');
  });
});

/**
 * Die Akzeptanz aus #98 am gerenderten Menuepunkt, nicht nur an der Naht:
 * sichtbar, gesperrt, mit Grund. Der `title` sitzt bewusst an der Huelle —
 * ueber einen `disabled`-Knopf feuert der Browser keine Mausereignisse.
 */
describe('Dashboard — gesperrter Menuepunkt im DOM', () => {
  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({
      id: 'x',
      name: 'P',
      nachricht: 'nachricht.gds.test.0001',
      nStatus: 0,
      nAusp: 0,
      aktualisiert: 0,
      ...over,
    }) as LibraryEntry;

  async function menue(e: LibraryEntry): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();
    TestBed.inject(ProfileStoreService).entries.set([e]);
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.dcMenuBtn')!.click();
    fixture.detectChanges();
    return host;
  }

  const punkt = (host: HTMLElement): HTMLButtonElement =>
    [...host.querySelectorAll<HTMLButtonElement>('.menuItem')].find((b) =>
      b.textContent?.includes('Testnachricht erstellen'),
    )!;

  it('sperrt den Menuepunkt und nennt den Grund sichtbar und im title', async () => {
    const host = await menue(eintrag({ nErw: 2 }));
    const knopf = punkt(host);
    expect(knopf.disabled).toBeTrue();
    expect(knopf.textContent).toContain('gesperrt: Schema-Erweiterungen');
    expect(knopf.closest('.menuHuelle')?.getAttribute('title')).toBe(ERW_SPERRE_GRUND);
  });

  it('laesst den Menuepunkt ohne Erweiterungen offen', async () => {
    const host = await menue(eintrag({ nErw: 0 }));
    const knopf = punkt(host);
    expect(knopf.disabled).toBeFalse();
    expect(knopf.textContent).not.toContain('gesperrt');
  });
});

/**
 * Schlagwort-Filter der Uebersicht (Ablage-Ordnung neben dem Fachmodul).
 * Mehrere gewaehlte Schlagworte grenzen zusammen ein (UND).
 */
describe('Dashboard — Filter nach Schlagworten', () => {
  let dash: {
    gewaehlteTags: { set: (v: string[]) => void; (): string[] };
    verfuegbareTags: () => { tag: string; n: number }[];
    sektionen: () => { items: LibraryEntry[] }[];
    search: { set: (v: string) => void };
    filtereNachTag: (tag: string, ev: Event) => void;
    tagAktiv: (tag: string) => boolean;
  };

  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({
      id: 'x',
      name: 'P',
      nachricht: 'nachricht.test.0001',
      nStatus: 0,
      nAusp: 0,
      aktualisiert: 0,
      ...over,
    }) as LibraryEntry;

  /** Alle Treffer ueber die Fachmodul-Abschnitte hinweg. */
  const treffer = (): string[] => dash.sektionen().flatMap((s) => s.items.map((e) => e.id));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();
    TestBed.inject(ProfileStoreService).entries.set([
      eintrag({ id: 'a', tags: ['Pilot', 'eNoVA'] }),
      eintrag({ id: 'b', tags: ['Pilot'] }),
      eintrag({ id: 'c' }),
    ]);
    dash = TestBed.createComponent(Dashboard).componentInstance as unknown as typeof dash;
  });

  it('bietet die vergebenen Schlagworte mit Haeufigkeit an', () => {
    expect(dash.verfuegbareTags()).toEqual([
      { tag: 'Pilot', n: 2 },
      { tag: 'eNoVA', n: 1 },
    ]);
  });

  it('grenzt auf ein Schlagwort ein, mehrere wirken zusammen', () => {
    dash.gewaehlteTags.set(['Pilot']);
    expect(treffer()).toEqual(['a', 'b']);
    dash.gewaehlteTags.set(['Pilot', 'eNoVA']);
    expect(treffer()).toEqual(['a']);
  });

  it('zeigt ohne Auswahl alles', () => {
    expect(treffer()).toEqual(['a', 'b', 'c']);
  });

  it('findet Schlagworte auch ueber die Freitextsuche', () => {
    dash.search.set('enova');
    expect(treffer()).toEqual(['a']);
  });

  it('schaltet den Filter ueber das Schlagwort auf der Kachel', () => {
    const ev = new MouseEvent('click');
    dash.filtereNachTag('Pilot', ev);
    expect(dash.tagAktiv('pilot')).toBeTrue();
    expect(treffer()).toEqual(['a', 'b']);
    dash.filtereNachTag('Pilot', ev);
    expect(dash.tagAktiv('Pilot')).toBeFalse();
  });
});

/**
 * Metadaten-Dialog der Kachel: dieselben Felder wie „Details…" im Editor,
 * aber ohne die Profilierung zu oeffnen — gepatcht wird nur, was der Dialog
 * fuehrt (der Server laesst den Rest des Dokuments stehen).
 */
describe('Dashboard — Metadaten an der Kachel', () => {
  let dash: {
    openRename: (id: string, e: Event) => void;
    submitRename: () => void;
    renName: () => string;
    renAutor: () => string;
    renBeschr: () => string;
    renTags: { (): string; set: (v: string) => void };
  };
  let patches: { id: string; patch: ProfilMetaPatch }[];

  const eintrag: LibraryEntry = {
    id: 'p1',
    name: 'Notar an Justiz',
    autor: 'Freiheit',
    beschreibung: 'Pilotbetrieb',
    tags: ['eNoVA', 'Pilot'],
    nStatus: 0,
    nAusp: 0,
    aktualisiert: 0,
  } as LibraryEntry;

  beforeEach(async () => {
    patches = [];
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();
    const store = TestBed.inject(ProfileStoreService);
    store.entries.set([eintrag]);
    spyOn(store, 'patchMeta').and.callFake(async (id: string, patch: ProfilMetaPatch) => {
      patches.push({ id, patch });
    });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    dash = fixture.componentInstance as unknown as typeof dash;
  });

  it('fuellt den Dialog aus dem Bibliothekseintrag', () => {
    dash.openRename('p1', new MouseEvent('click'));
    expect(dash.renName()).toBe('Notar an Justiz');
    expect(dash.renAutor()).toBe('Freiheit');
    expect(dash.renBeschr()).toBe('Pilotbetrieb');
    expect(dash.renTags()).toBe('eNoVA, Pilot');
  });

  it('schreibt die vier Felder normalisiert zurueck', () => {
    dash.openRename('p1', new MouseEvent('click'));
    dash.renTags.set('Pilot, pilot, Schulung');
    dash.submitRename();
    expect(patches).toEqual([
      {
        id: 'p1',
        patch: {
          name: 'Notar an Justiz',
          autor: 'Freiheit',
          beschreibung: 'Pilotbetrieb',
          tags: ['Pilot', 'Schulung'],
        },
      },
    ]);
  });

  it('haelt den Klick an der Kachel auf — der Dialog oeffnet, das Profil nicht', () => {
    const ev = new MouseEvent('click', { cancelable: true });
    spyOn(ev, 'stopPropagation');
    dash.openRename('p1', ev);
    expect(ev.stopPropagation).toHaveBeenCalled();
  });
});

/**
 * Einsortieren (#134): Projekt und Schlagworte — die Ablage, nicht die
 * fachliche Aussage. Der Dialog legt bei Bedarf gleich das Projekt an; ohne
 * Namen bleibt es beim "keinem Projekt zugeordnet", statt ein namenloses
 * Projekt in die Welt zu setzen.
 */
describe('Dashboard — Einsortieren', () => {
  let dash: {
    openAblage: (e: LibraryEntry, ev: Event) => void;
    submitAblage: () => Promise<void>;
    ablProjekt: { (): string; set: (v: string) => void };
    ablNeu: { (): string; set: (v: string) => void };
    ablTags: { (): string; set: (v: string) => void };
    nurProjekt: { set: (v: string) => void };
    sektionen: () => { items: LibraryEntry[] }[];
  };
  let patches: { id: string; patch: AblagePatch }[];
  let angelegt: ProjektPatch[];

  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({
      id: 'p1',
      name: 'Ersuchen an die Gemeinde',
      nachricht: 'nachricht.genuva.ersuchen',
      nStatus: 0,
      nAusp: 0,
      aktualisiert: 0,
      ...over,
    }) as LibraryEntry;

  const imProjekt = eintrag({ id: 'p1', projektId: 'prj1', tags: ['Pilot'] });
  const imAnderen = eintrag({ id: 'p2', projektId: 'prj2' });
  const ohneProjekt = eintrag({ id: 'p3' });
  const eintraege = [imProjekt, imAnderen, ohneProjekt];

  beforeEach(async () => {
    patches = [];
    angelegt = [];
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();
    const store = TestBed.inject(ProfileStoreService);
    store.entries.set(eintraege);
    spyOn(store, 'einsortieren').and.callFake(async (id: string, patch: AblagePatch) => {
      patches.push({ id, patch });
    });
    const projekte = TestBed.inject(ProjektStoreService);
    projekte.entries.set([]);
    spyOn(projekte, 'create').and.callFake(async (patch: ProjektPatch) => {
      angelegt.push(patch);
      return 'neu1';
    });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    dash = fixture.componentInstance as unknown as typeof dash;
  });

  it('grenzt die Uebersicht auf ein Projekt ein', () => {
    const treffer = (): string[] => dash.sektionen().flatMap((s) => s.items.map((e) => e.id));
    expect(treffer()).toEqual(['p1', 'p2', 'p3']);
    dash.nurProjekt.set('prj1');
    expect(treffer()).toEqual(['p1']);
  });

  it('fuellt den Dialog aus dem Eintrag', () => {
    dash.openAblage(imProjekt, new MouseEvent('click'));
    expect(dash.ablProjekt()).toBe('prj1');
    expect(dash.ablTags()).toBe('Pilot');
  });

  it('ordnet einem vorhandenen Projekt zu und normalisiert die Schlagworte', async () => {
    dash.openAblage(ohneProjekt, new MouseEvent('click'));
    dash.ablProjekt.set('prj2');
    dash.ablTags.set('Pilot, pilot, Schulung');
    await dash.submitAblage();
    expect(patches).toEqual([
      { id: 'p3', patch: { projektId: 'prj2', tags: ['Pilot', 'Schulung'] } },
    ]);
    expect(angelegt).toEqual([]);
  });

  it('legt ein neues Projekt an und ordnet in einem Zug zu', async () => {
    dash.openAblage(ohneProjekt, new MouseEvent('click'));
    dash.ablProjekt.set(PROJEKT_NEU);
    dash.ablNeu.set('GenUVA');
    await dash.submitAblage();
    expect(angelegt).toEqual([{ name: 'GenUVA' }]);
    expect(patches).toEqual([{ id: 'p3', patch: { projektId: 'neu1', tags: [] } }]);
  });

  it('legt ohne Namen kein Projekt an — die Zuordnung faellt weg', async () => {
    dash.openAblage(imProjekt, new MouseEvent('click'));
    dash.ablProjekt.set(PROJEKT_NEU);
    dash.ablNeu.set('   ');
    await dash.submitAblage();
    expect(angelegt).toEqual([]);
    // Die Schlagworte des Eintrags stehen im Dialog und werden mitgeschrieben;
    // nur die Projektzuordnung faellt weg.
    expect(patches).toEqual([{ id: 'p1', patch: { projektId: null, tags: ['Pilot'] } }]);
  });

  it('loest die Zuordnung, wenn "keinem Projekt" gewaehlt wird', async () => {
    dash.openAblage(imProjekt, new MouseEvent('click'));
    dash.ablProjekt.set('');
    await dash.submitAblage();
    expect(patches).toEqual([{ id: 'p1', patch: { projektId: null, tags: ['Pilot'] } }]);
  });
});
