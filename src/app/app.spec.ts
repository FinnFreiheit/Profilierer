import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { StateService } from './core/services/state.service';
import { GuidedService } from './core/services/guided.service';
import { NavService } from './core/services/nav.service';
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
  });
});
