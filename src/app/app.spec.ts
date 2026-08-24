import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { App } from './app';
import { StateService } from './core/services/state.service';
import { GuidedService } from './core/services/guided.service';
import { NavService } from './core/services/nav.service';
import { ToastService } from './core/services/toast.service';
import { NachrichtSpeichernService } from './core/services/nachricht-speichern.service';
import { MigrationService } from './core/services/migration.service';
import { TeilenService } from './core/services/teilen.service';
import { BundledSchemaService } from './core/services/bundled-schema.service';
import { SchemaStoreService } from './core/services/schema-store.service';
import { PersistenceService } from './core/services/persistence.service';
import { TreeItem } from './models/node.model';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('startet mit dem Dashboard und rendert dessen Kopfzeile', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.dashHead h1')?.textContent).toContain('Pfadfinder');
  });

  describe('Rueckweg der Kopfzeile', () => {
    /** Der Knopf ist `protected`; die Spec ruft ihn ueber die Schnittstelle. */
    async function zurueck(app: App): Promise<void> {
      await (app as unknown as { zurUebersicht(): Promise<void> }).zurUebersicht();
    }

    it('fuehrt aus einer Profilierung in die Profil-Bibliothek', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      const state = TestBed.inject(StateService);
      state.view.set('editor');

      await zurueck(app);

      expect(state.view()).toBe('dashboard');
    });

    it('fuehrt aus einer geoeffneten Testnachricht in den Testdatenspeicher', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      const state = TestBed.inject(StateService);
      state.view.set('editor');
      state.messageEdit.set({ msgName: 'm', entryId: 'e1' } as never);

      await zurueck(app);

      expect(state.view()).toBe('testdaten');
    });

    it('fuehrt auch aus der gefuehrten Erstellung in den Testdatenspeicher', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      const state = TestBed.inject(StateService);
      state.view.set('editor');
      state.messageCreate.set({ msgName: 'm', entryId: null, name: null });

      await zurueck(app);

      expect(state.view()).toBe('testdaten');
    });

    // Eine hochgeladene Nachricht (kein Eintrag im Speicher) wird beim
    // Verlassen zur Rueckfrage vorgelegt — „Abbrechen" haelt die Baumansicht.
    it('fragt bei einer nur geoeffneten Nachricht und bleibt bei Abbruch stehen', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      const state = TestBed.inject(StateService);
      const frage = TestBed.inject(NachrichtSpeichernService);
      state.view.set('editor');
      state.messageEdit.set({ msgName: 'm', quellName: 'upload.xml', entryId: null } as never);

      const lauf = zurueck(app);
      expect(frage.anfrage()!.vorschlag).toBe('upload.xml');
      frage.antworte({ art: 'abbrechen' });
      await lauf;

      expect(state.view()).toBe('editor');
    });

    it('verwirft auf Wunsch und geht in den Testdatenspeicher', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      const state = TestBed.inject(StateService);
      const frage = TestBed.inject(NachrichtSpeichernService);
      state.view.set('editor');
      state.messageEdit.set({ msgName: 'm', quellName: 'upload.xml', entryId: null } as never);

      const lauf = zurueck(app);
      frage.antworte({ art: 'verwerfen' });
      await lauf;

      expect(state.view()).toBe('testdaten');
    });
  });

  describe('Escape hebt die Auswahl auf (#82)', () => {
    it('leert selItem und macht damit die Liste der offenen Punkte erreichbar', () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      const state = TestBed.inject(StateService);
      state.selItem.set({ kind: 'el', node: { path: 'x' } } as unknown as TreeItem);

      const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      app.onKeydown(ev);

      expect(state.selItem()).toBeNull();
      expect(ev.defaultPrevented).toBe(true);
    });

    it('bleibt ohne Auswahl wirkungslos', () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      const state = TestBed.inject(StateService);
      state.selItem.set(null);

      const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      app.onKeydown(ev);

      expect(ev.defaultPrevented).toBe(false);
    });
  });

  describe('onKeydown (gefuehrter Profil-Modus)', () => {
    let app: App;
    let state: StateService;
    let guided: GuidedService;
    let nav: NavService;

    /** Fake-Selektion reicht: der Handler prueft nur Truthiness, die Guided-Methoden sind Spies. */
    const fakeItem = { kind: 'el', node: { path: 'x' } } as unknown as TreeItem;

    const key = (k: string, init: KeyboardEventInit = {}): KeyboardEvent =>
      new KeyboardEvent('keydown', { key: k, cancelable: true, ...init });

    beforeEach(() => {
      app = TestBed.createComponent(App).componentInstance;
      state = TestBed.inject(StateService);
      guided = TestBed.inject(GuidedService);
      nav = TestBed.inject(NavService);
      state.guided.set(true);
      state.selItem.set(fakeItem);
      spyOn(guided, 'gotoPrev');
      spyOn(guided, 'gotoNextOpen');
      spyOn(guided, 'setzeDisposition').and.returnValue(true);
      spyOn(nav, 'arrowNavigate').and.returnValue(false);
    });

    it('Links/Rechts steuern die Spur statt der Baum-Navigation', () => {
      const links = key('ArrowLeft');
      app.onKeydown(links);
      expect(guided.gotoPrev).toHaveBeenCalled();
      expect(links.defaultPrevented).toBeTrue();

      const rechts = key('ArrowRight');
      app.onKeydown(rechts);
      expect(guided.gotoNextOpen).toHaveBeenCalled();
      expect(rechts.defaultPrevented).toBeTrue();
      expect(nav.arrowNavigate).not.toHaveBeenCalled();
    });

    it('z/o/n setzen die Disposition gemaess Wirkung', () => {
      app.onKeydown(key('z'));
      expect(guided.setzeDisposition).toHaveBeenCalledWith('pflicht');
      app.onKeydown(key('O')); // Grossbuchstabe (Shift) zaehlt auch
      expect(guided.setzeDisposition).toHaveBeenCalledWith('optional');
      app.onKeydown(key('n'));
      expect(guided.setzeDisposition).toHaveBeenCalledWith('ausgeschlossen');
    });

    it('greift nicht bei Modifier-Tasten oder Fokus in Eingabefeldern', () => {
      app.onKeydown(key('z', { metaKey: true }));
      app.onKeydown(key('n', { ctrlKey: true }));
      const inInput = key('z');
      Object.defineProperty(inInput, 'target', { value: document.createElement('input') });
      app.onKeydown(inInput);
      expect(guided.setzeDisposition).not.toHaveBeenCalled();
    });

    it('faellt ohne gefuehrten Modus auf die Baum-Navigation zurueck', () => {
      state.guided.set(false);
      app.onKeydown(key('ArrowLeft'));
      expect(nav.arrowNavigate).toHaveBeenCalledWith('ArrowLeft');
      expect(guided.gotoPrev).not.toHaveBeenCalled();
      app.onKeydown(key('z')); // z ohne gefuehrten Modus: keine Wirkung
      expect(guided.setzeDisposition).not.toHaveBeenCalled();
    });

    it('greift nicht im Instanz-Modus (Testnachricht) und nicht read-only', () => {
      state.messageCreate.set({ msgName: 'm', entryId: null, name: null });
      app.onKeydown(key('z'));
      state.messageCreate.set(null);
      state.readOnly.set(true);
      app.onKeydown(key('z'));
      expect(guided.setzeDisposition).not.toHaveBeenCalled();
    });

    // ── Gefuehrter Durchlauf einer Nachricht (ADR 0016) ────────────────
    describe('Instanz-Durchlauf', () => {
      beforeEach(() => {
        state.messageCreate.set({ msgName: 'm', entryId: null, name: null });
        spyOn(guided, 'gotoNext');
        spyOn(guided, 'betreteStation').and.returnValue(true);
        spyOn(guided, 'gotoUebergeordnet').and.returnValue(true);
      });

      it('senkrecht die Spur, waagerecht die Tiefe — ohne Rueckfall auf den Baum', () => {
        const runter = key('ArrowDown');
        app.onKeydown(runter);
        expect(guided.gotoNext).toHaveBeenCalled();
        expect(runter.defaultPrevented).toBeTrue();

        app.onKeydown(key('ArrowUp'));
        expect(guided.gotoPrev).toHaveBeenCalled();

        app.onKeydown(key('ArrowLeft'));
        expect(guided.betreteStation).toHaveBeenCalled();

        app.onKeydown(key('ArrowRight'));
        expect(guided.gotoUebergeordnet).toHaveBeenCalled();
        // Die Baum-Navigation laeuft andersherum und darf hier nicht greifen.
        expect(nav.arrowNavigate).not.toHaveBeenCalled();
      });

      it('eine offene Pflichtangabe haelt das Weiterblaettern fest und nennt den Grund', () => {
        spyOn(guided, 'ueberspringSperre').and.returnValue('Pflichtangabe — …');
        const toast = spyOn(TestBed.inject(ToastService), 'show');

        const runter = key('ArrowDown');
        app.onKeydown(runter);

        expect(guided.gotoNext).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('Pflichtangabe — …');
        expect(runter.defaultPrevented).toBeTrue();
        // Zurueck bleibt frei — sonst waere der Durchlauf dort gefangen.
        app.onKeydown(key('ArrowUp'));
        expect(guided.gotoPrev).toHaveBeenCalled();
      });

      it('nimmt den Zweig-Radios die Pfeiltasten ab (Fokus nach der Zweigwahl)', () => {
        const radio = document.createElement('input');
        radio.type = 'radio';
        const runter = key('ArrowDown');
        Object.defineProperty(runter, 'target', { value: radio });

        app.onKeydown(runter);

        expect(guided.gotoNext).toHaveBeenCalled();
        expect(runter.defaultPrevented).toBeTrue(); // Browser schaltet den Zweig nicht weiter
      });

      it('laesst Textfelder unberuehrt', () => {
        const imFeld = key('ArrowDown');
        Object.defineProperty(imFeld, 'target', { value: document.createElement('input') });
        app.onKeydown(imFeld);
        expect(guided.gotoNext).not.toHaveBeenCalled();
      });
    });
  });
});

/**
 * Start-Datenbasis (Bugfix „von xjustiz.de geholte Version wird vergessen"):
 * gespeicherte Versionen stehen wieder im Umschalter, und der Start kommt zu
 * der zurueck, die zuletzt aktiv war.
 */
describe('App — Datenbasis beim Start', () => {
  const hinterlegt = {
    id: '3.6.2',
    label: '3.6.2',
    dir: '3.6.2',
    files: ['a.xsd'],
    default: true,
  };
  const gespeichert = {
    id: '4.1.0',
    label: '4.1.0',
    dir: 'xjustiz.de/4.1.0',
    files: ['b.xsd'],
    zipUrl: '/system/zip/XJustiz-4_1_0-XSD.zip',
  };

  /** dirs, die geladen wurden — in der Reihenfolge der Versuche. */
  let geladen: string[];
  /** dirs, deren Laden scheitert (Backend/Netz weg). */
  let scheitert: Set<string>;
  let gemerkteDatenbasis: WritableSignal<string>;
  let imSpeicher: (typeof gespeichert)[];

  async function starte(): Promise<{ app: App; state: StateService }> {
    geladen = [];
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: MigrationService, useValue: { runOnce: async () => {} } },
        { provide: TeilenService, useValue: { startZiel: () => null } },
        {
          provide: BundledSchemaService,
          useValue: { manifest: async () => [hinterlegt], files: async () => [] },
        },
        {
          provide: SchemaStoreService,
          useValue: { refresh: async () => {}, entries: () => imSpeicher },
        },
        {
          provide: PersistenceService,
          useValue: {
            zuletztAktiveDatenbasis: gemerkteDatenbasis,
            loadBundle: async (v: { dir: string }) => {
              geladen.push(v.dir);
              if (scheitert.has(v.dir)) throw new Error('nicht erreichbar');
              return 1;
            },
          },
        },
      ],
    }).compileComponents();
    const app = TestBed.createComponent(App).componentInstance;
    await app.ngOnInit();
    return { app, state: TestBed.inject(StateService) };
  }

  beforeEach(() => {
    scheitert = new Set();
    imSpeicher = [gespeichert];
    gemerkteDatenbasis = signal('');
  });

  it('mischt die gespeicherten Versionen von xjustiz.de in den Umschalter', async () => {
    const { state } = await starte();
    expect(state.bundledVersions().map((v) => v.id)).toEqual(['3.6.2', '4.1.0']);
  });

  it('startet ohne gemerkte Wahl mit der hinterlegten Standardversion', async () => {
    await starte();
    expect(geladen).toEqual(['3.6.2']);
  });

  it('kommt zur zuletzt gewaehlten Version zurueck', async () => {
    gemerkteDatenbasis = signal('xjustiz.de/4.1.0');
    await starte();
    expect(geladen).toEqual(['xjustiz.de/4.1.0']);
  });

  it('faellt auf den Standard zurueck, wenn die gemerkte nicht ladbar ist', async () => {
    gemerkteDatenbasis = signal('xjustiz.de/4.1.0');
    scheitert = new Set(['xjustiz.de/4.1.0']);
    await starte();
    expect(geladen).toEqual(['xjustiz.de/4.1.0', '3.6.2']);
  });

  it('nimmt den Standard, wenn die gemerkte Version gar nicht mehr existiert', async () => {
    gemerkteDatenbasis = signal('xjustiz.de/9.9.9');
    imSpeicher = [];
    await starte();
    expect(geladen).toEqual(['3.6.2']);
  });
});
