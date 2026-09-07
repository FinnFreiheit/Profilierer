import { TestBed } from '@angular/core/testing';
import { Projekte } from './projekte';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { StateService } from '../../core/services/state.service';
import { LibraryEntry } from '../../models/profile.model';
import { TestmessageEntry } from '../../models/testmessage.model';
import { Projekt } from '../../models/projekt.model';

/**
 * Projektseite (#135): zweistufig — Projekt → Profilierung (=
 * Kommunikationsszenario) → Testnachrichten. Geprueft wird die Zuordnung der
 * Zeilen, denn genau dort entsteht der Zusammenhang, den die beiden anderen
 * Ansichten nicht zeigen.
 */
describe('Projekte — Szenarien einer Projektseite', () => {
  let prj: {
    szenarien: () => { profil: LibraryEntry; nachrichten: TestmessageEntry[] }[];
    ohneSzenario: () => TestmessageEntry[];
    oeffne: (id: string) => void;
    zurUebersicht: () => void;
    gefiltert: () => Projekt[];
    search: { set: (v: string) => void };
    gewaehlteTags: { set: (v: string[]) => void };
    fInhalt: { set: (v: string[]) => void };
    achsen: () => { key: string; werte: { id: string; n: number; aktiv: boolean }[] }[];
    aktiveChips: () => { key: string; id: string; label: string }[];
    hatFilter: () => boolean;
    trefferText: () => string;
    resetAlles: () => void;
    sprungliste: () => { id: string; name: string; anteil: number | null; nTest: number }[];
  };

  const profil = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({ id: 'p', name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 0, ...over }) as LibraryEntry;

  const nachricht = (over: Partial<TestmessageEntry> = {}): TestmessageEntry =>
    ({
      id: 't',
      name: 'a.xml',
      groesse: 0,
      hochgeladen: 0,
      aktualisiert: 0,
      ...over,
    }) as TestmessageEntry;

  // GenUVA: zwei Ersuchen auf derselben Nachricht, eine Sachentscheidung.
  const profile = [
    profil({
      id: 'sach',
      name: 'Gemeinde an Notar',
      nachricht: 'nachricht.genuva.sachentscheidung',
      projektId: 'prj1',
    }),
    profil({
      id: 'gericht',
      name: 'Ersuchen an das Gericht',
      nachricht: 'nachricht.genuva.ersuchen',
      projektId: 'prj1',
    }),
    profil({
      id: 'gemeinde',
      name: 'Ersuchen an die Gemeinde',
      nachricht: 'nachricht.genuva.ersuchen',
      projektId: 'prj1',
      nPunkte: 8,
      nEntschieden: 6,
    }),
    profil({ id: 'fremd', name: 'Anderes Vorhaben', projektId: 'prj2' }),
  ];

  const nachrichten = [
    nachricht({ id: 'g2', name: '2 Beteiligte', profilId: 'gemeinde', projektId: 'prj1' }),
    nachricht({ id: 'g1', name: '1 Beteiligter', profilId: 'gemeinde', projektId: 'prj1' }),
    nachricht({ id: 'upload', name: 'upload.xml', projektId: 'prj1' }),
    nachricht({ id: 'verwaist', name: 'verwaist.xml', profilId: 'geloescht', projektId: 'prj1' }),
    nachricht({ id: 'fremd', name: 'fremd.xml', profilId: 'fremd', projektId: 'prj2' }),
  ];

  const projekte: Projekt[] = [
    {
      id: 'prj1',
      name: 'GenUVA',
      tags: ['Pilot'],
      angelegt: 0,
      aktualisiert: 0,
      nProfile: 3,
      nTestnachrichten: 4,
    },
    { id: 'prj2', name: 'Anderes', angelegt: 0, aktualisiert: 0, nProfile: 1, nTestnachrichten: 1 },
    {
      id: 'prj3',
      name: 'Leeres Vorhaben',
      tags: ['Pilot'],
      angelegt: 0,
      aktualisiert: 0,
      nProfile: 0,
      nTestnachrichten: 0,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Projekte],
      providers: [
        {
          provide: ProfileStoreService,
          useValue: { entries: () => profile, refresh: async () => {} },
        },
        {
          provide: TestmessageStoreService,
          useValue: { entries: () => nachrichten, refresh: async () => {} },
        },
      ],
    }).compileComponents();
    TestBed.inject(ProjektStoreService).entries.set(projekte);
    TestBed.inject(StateService).offenesProjekt.set(null);
    prj = TestBed.createComponent(Projekte).componentInstance as unknown as typeof prj;
  });

  it('zeigt ohne offenes Projekt keine Szenarien', () => {
    expect(prj.szenarien()).toEqual([]);
    expect(prj.ohneSzenario()).toEqual([]);
  });

  it('sortiert die Szenarien nach Nachrichtentyp — Ersuchen beieinander', () => {
    prj.oeffne('prj1');
    // Beide Ersuchen zuerst (gleicher Nachrichtentyp), dann die
    // Sachentscheidung; innerhalb des Typs alphabetisch nach Name.
    expect(prj.szenarien().map((s) => s.profil.id)).toEqual(['gericht', 'gemeinde', 'sach']);
  });

  it('haengt die Testnachrichten unter ihre Profilierung', () => {
    prj.oeffne('prj1');
    const zeilen = prj.szenarien();
    const gemeinde = zeilen.find((z) => z.profil.id === 'gemeinde');
    expect(gemeinde?.nachrichten.map((t) => t.id)).toEqual(['g1', 'g2']);
    // Ein Szenario ohne Testdaten ist eine Luecke, keine fehlende Zeile.
    expect(zeilen.find((z) => z.profil.id === 'gericht')?.nachrichten).toEqual([]);
    expect(zeilen.find((z) => z.profil.id === 'sach')?.nachrichten).toEqual([]);
  });

  it('sammelt Uploads und verwaiste Nachrichten in einer eigenen Zeile', () => {
    prj.oeffne('prj1');
    // Sonst zaehlte die Kachel mehr, als die Seite auflistet.
    expect(prj.ohneSzenario().map((t) => t.id)).toEqual(['upload', 'verwaist']);
  });

  it('zeigt nur, was zum offenen Projekt gehoert', () => {
    prj.oeffne('prj2');
    expect(prj.szenarien().map((s) => s.profil.id)).toEqual(['fremd']);
    expect(prj.szenarien()[0]?.nachrichten.map((t) => t.id)).toEqual(['fremd']);
  });

  it('durchsucht die Uebersicht nach Name, Beschreibung und Schlagwort', () => {
    expect(prj.gefiltert().map((p) => p.id)).toEqual(['prj1', 'prj2', 'prj3']);
    prj.search.set('pilot');
    expect(prj.gefiltert().map((p) => p.id)).toEqual(['prj1', 'prj3']);
    prj.search.set('genuva');
    expect(prj.gefiltert().map((p) => p.id)).toEqual(['prj1']);
  });

  it('kehrt zur Uebersicht zurueck', () => {
    prj.oeffne('prj1');
    prj.zurUebersicht();
    expect(prj.szenarien()).toEqual([]);
  });

  it('grenzt auf leere Projekte ein — nProfile === 0', () => {
    prj.fInhalt.set(['ohneSzenarien']);
    expect(prj.gefiltert().map((p) => p.id)).toEqual(['prj3']);
    prj.fInhalt.set(['mitTestnachrichten']);
    expect(prj.gefiltert().map((p) => p.id)).toEqual(['prj1', 'prj2']);
  });

  it('verknuepft die Achsen mit UND', () => {
    // "Pilot" traegt prj1 und prj3; von beiden bleibt nur das leere uebrig.
    prj.gewaehlteTags.set(['Pilot']);
    prj.fInhalt.set(['ohneSzenarien']);
    expect(prj.gefiltert().map((p) => p.id)).toEqual(['prj3']);
    expect(prj.hatFilter()).toBe(true);
    expect(prj.aktiveChips().map((c) => c.key)).toEqual(['tag', 'inhalt']);
    expect(prj.trefferText()).toBe('1 von 3');
    prj.resetAlles();
    expect(prj.gefiltert().length).toBe(3);
    expect(prj.trefferText()).toBe('3 Projekte');
  });

  it('zaehlt an den Achsen, was der Klick braechte — nicht was uebrig bliebe', () => {
    prj.fInhalt.set(['ohneSzenarien']);
    const inhalt = prj.achsen().find((a) => a.key === 'inhalt');
    // Die eigene Achse wird beim Zaehlen ausgeblendet: "mit Szenarien" zeigt
    // die zwei, die ein Klick braechte, nicht null.
    expect(inhalt?.werte.find((w) => w.id === 'mitSzenarien')?.n).toBe(2);
    expect(inhalt?.werte.find((w) => w.id === 'ohneSzenarien')).toEqual(
      jasmine.objectContaining({ n: 1, aktiv: true }),
    );
    // Die Schlagwort-Achse zaehlt dagegen unter der gesetzten Eingrenzung.
    const tag = prj.achsen().find((a) => a.key === 'tag');
    expect(tag?.werte.find((w) => w.id === 'Pilot')?.n).toBe(1);
  });

  it('liefert die Sprungliste mit Anteilen und Nachrichtenzahl', () => {
    prj.oeffne('prj1');
    expect(prj.sprungliste().map((s) => s.id)).toEqual(['gericht', 'gemeinde', 'sach']);
    const gemeinde = prj.sprungliste().find((s) => s.id === 'gemeinde');
    expect(gemeinde?.name).toBe('Ersuchen an die Gemeinde');
    expect(gemeinde?.anteil).toBe(75);
    expect(gemeinde?.nTest).toBe(2);
    // Ohne Punkte gibt es keinen Anteil — die Spalte zeigt dann "—".
    expect(prj.sprungliste().find((s) => s.id === 'sach')?.anteil).toBeNull();
  });
});
