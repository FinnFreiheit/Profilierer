import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { StateService } from './core/services/state.service';
import { GuidedService } from './core/services/guided.service';
import { NavService } from './core/services/nav.service';
import { ToastService } from './core/services/toast.service';
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
    expect(compiled.querySelector('.dashHead h1')?.textContent).toContain('Profilierer');
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
