import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetailPanel } from './detail-panel';
import { StateService } from '../../core/services/state.service';
import { GuidedService } from '../../core/services/guided.service';
import { NavService } from '../../core/services/nav.service';
import { DatentypQuelle } from '../../models/profile.model';
import { signal } from '@angular/core';

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

/**
 * Ruhezustand (#82): ohne Auswahl zeigt die Spalte die naechsten offenen
 * Punkte statt leer zu stehen. Die Liste bricht bei zehn ab und weist die
 * uebrigen aus — eine stille Truncation las sich sonst wie Vollstaendigkeit.
 */
describe('DetailPanel — Ruhezustand', () => {
  let state: StateService;
  let guided: GuidedService;

  beforeEach(async () => {
    localStorage.removeItem('xjp.ui.detailBreite');
    localStorage.removeItem('xjp.ui.detailZu');
    await TestBed.configureTestingModule({ imports: [DetailPanel] }).compileComponents();
    state = TestBed.inject(StateService);
    guided = TestBed.inject(GuidedService);
    state.root.set({ path: 'r', name: 'r' } as never);
    state.selItem.set(null);
  });

  const bauen = () => {
    const fixture = TestBed.createComponent(DetailPanel);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const punkte = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ path: `r/e${i}`, kritisch: true }));

  /**
   * `offeneListe` ist eine gewoehnliche Property (kein Getter) — spyOnProperty
   * greift dort nicht. Das Signal wird deshalb vor dem Bauen der Komponente
   * ersetzt; danach gelesene computeds haetten die alte Referenz.
   */
  const setzeOffen = (liste: { path: string; kritisch: boolean }[]): void => {
    Object.defineProperty(guided, 'offeneListe', { value: signal(liste), configurable: true });
  };

  it('zeigt ohne offene Punkte den Kurzhinweis', () => {
    setzeOffen([]);
    expect(bauen().querySelector('.ruheListe')).toBeNull();
    expect(bauen().querySelector('.detailRuhe')).not.toBeNull();
  });

  it('listet offene Punkte zum Anspringen', () => {
    setzeOffen(punkte(3));
    const el = bauen();
    expect(el.querySelectorAll('.ruheItem').length).toBe(3);
    expect(el.querySelector('h3')?.textContent).toContain('Offene');
  });

  it('bricht bei zehn ab und weist die uebrigen aus', () => {
    setzeOffen(punkte(14));
    const el = bauen();
    expect(el.querySelectorAll('.ruheItem').length).toBe(10);
    expect(el.querySelector('.detailRuhe')?.textContent).toContain('4 weitere');
  });

  it('springt beim Klick zum Element', () => {
    setzeOffen(punkte(2));
    const nav = TestBed.inject(NavService);
    const jump = spyOn(nav, 'jumpTo');
    bauen().querySelector<HTMLButtonElement>('.ruheItem')!.click();
    expect(jump).toHaveBeenCalledWith('r/e0', true);
  });

  it('zeigt in der Schema-Ansicht keine Liste — dort wird nichts entschieden', () => {
    setzeOffen(punkte(5));
    state.schemaView.set(true);
    expect(bauen().querySelector('.ruheListe')).toBeNull();
  });
});

/**
 * Datentyp einer Schema-Erweiterung (#96): das Detailpanel benutzt denselben
 * Typwaehler wie der Anlege-Dialog — vorher pflegten beide ihre eigene Liste.
 */
describe('DetailPanel — Datentyp einer Schema-Erweiterung', () => {
  let state: StateService;
  let fixture: ComponentFixture<DetailPanel>;

  const ELTERN = 'nachricht.x/kopf';

  beforeEach(async () => {
    localStorage.removeItem('xjp.ui.detailBreite');
    localStorage.removeItem('xjp.ui.detailZu');
    await TestBed.configureTestingModule({ imports: [DetailPanel] }).compileComponents();
    state = TestBed.inject(StateService);
    state.root.set({ path: 'nachricht.x', name: 'nachricht.x' } as never);
    fixture = TestBed.createComponent(DetailPanel);
  });

  /** Den Erweiterungs-Knoten selektieren, wie ihn `TreeService` baut. */
  const selektiere = (id: string): void => {
    const erw = state.erweiterungenOf(ELTERN)!.find((e) => e.id === id)!;
    state.selItem.set({
      kind: 'el',
      node: {
        path: `${ELTERN}/~${id}`,
        name: erw.name,
        min: erw.min,
        max: erw.max,
        doc: '',
        typeName: erw.datentyp ?? null,
        erweiterung: erw,
        children: null,
        typeStack: [],
      },
    } as never);
    fixture.detectChanges();
  };

  /** Erweiterung anlegen und als ausgewaehlten Baumknoten setzen. */
  const waehleErw = (typ: { datentyp?: string; datentypQuelle?: DatentypQuelle }): string => {
    const id = state.addErweiterung(ELTERN, { name: 'zusatz', min: '1', max: '1', ...typ });
    selektiere(id);
    return id;
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const picker = () => fixture.debugElement.query((d) => d.name === 'app-datentyp-picker');

  it('zeigt den gespeicherten Typ im Waehler', () => {
    waehleErw({ datentyp: 'string' });
    expect(el().querySelector('.typKnopf')?.textContent).toContain('xs:string');
  });

  it('schreibt Typ und Herkunft der Wahl in die Erweiterung', () => {
    const id = waehleErw({ datentyp: 'string' });
    picker().componentInstance.gewaehlt.emit({
      datentyp: 'Type.GDS.Akte',
      datentypQuelle: 'schema',
    });
    fixture.detectChanges();
    const e = state.erweiterungenOf(ELTERN)!.find((x) => x.id === id)!;
    expect(e.datentyp).toBe('Type.GDS.Akte');
    expect(e.datentypQuelle).toBe('schema');
  });

  it('macht aus der Erweiterung einen Container und bietet dann Unterelemente an', () => {
    const id = waehleErw({ datentyp: 'string' });
    expect(el().textContent).not.toContain('+ Unterelement');
    picker().componentInstance.gewaehlt.emit({ datentyp: undefined, datentypQuelle: undefined });
    fixture.detectChanges();
    const e = state.erweiterungenOf(ELTERN)!.find((x) => x.id === id)!;
    expect(e.datentyp).toBeUndefined();
    expect(e.datentypQuelle).toBeUndefined();
    // Der Baum baut den Knoten neu; danach ist es ein Container.
    selektiere(id);
    expect(el().querySelector('.typKnopf')?.textContent).toContain('Container');
    expect(el().textContent).toContain('+ Unterelement');
  });
});
