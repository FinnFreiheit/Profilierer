import { TestBed } from '@angular/core/testing';
import { DetailPanel } from './detail-panel';
import { StateService } from '../../core/services/state.service';

/**
 * Kern von #81: die Spalte belegt Platz, sobald eine Nachricht geladen ist —
 * unabhaengig davon, ob etwas ausgewaehlt ist. Vorher hing ihre Sichtbarkeit
 * an der Selektion, wodurch der erste Klick auf einen Kasten den Baumbereich
 * um ~400px verschmaelerte und die Kaskade neu umbrach.
 */
describe('DetailPanel — feste Spalte', () => {
  let state: StateService;

  beforeEach(async () => {
    localStorage.removeItem('xjp.ui.detailBreite');
    localStorage.removeItem('xjp.ui.detailZu');
    await TestBed.configureTestingModule({ imports: [DetailPanel] }).compileComponents();
    state = TestBed.inject(StateService);
  });

  afterEach(() => {
    localStorage.removeItem('xjp.ui.detailBreite');
    localStorage.removeItem('xjp.ui.detailZu');
  });

  const panel = (): HTMLElement | null => {
    const fixture = TestBed.createComponent(DetailPanel);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('#detail');
  };

  it('zeigt ohne geladene Nachricht keine Spalte', () => {
    state.root.set(null);
    expect(panel()).toBeNull();
  });

  it('haelt die Spalte bei geladener Nachricht auch ohne Auswahl', () => {
    state.root.set({ path: 'r', name: 'r' } as never);
    state.selItem.set(null);

    const p = panel();
    expect(p).not.toBeNull();
    expect(p?.querySelector('.detailRuhe')).not.toBeNull();
  });

  it('setzt ohne gezogene Breite keine Inline-Breite — die CSS-Automatik gilt', () => {
    state.root.set({ path: 'r', name: 'r' } as never);
    expect(panel()?.style.width).toBe('');
  });

  it('uebernimmt eine gemerkte Breite als Inline-Wert', () => {
    localStorage.setItem('xjp.ui.detailBreite', '480');
    state.root.set({ path: 'r', name: 'r' } as never);

    expect(panel()?.style.width).toBe('480px');
  });

  it('zeigt eingeklappt nur den Wiederaufklapp-Knopf und keine Breite', () => {
    localStorage.setItem('xjp.ui.detailZu', 'ja');
    localStorage.setItem('xjp.ui.detailBreite', '480');
    state.root.set({ path: 'r', name: 'r' } as never);

    const p = panel();
    expect(p?.classList.contains('zu')).toBe(true);
    expect(p?.querySelector('.detailAuf')).not.toBeNull();
    expect(p?.querySelector('.detailInhalt')).toBeNull();
    expect(p?.style.width).toBe('');
  });
});
