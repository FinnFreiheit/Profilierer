import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AktivChips } from './aktiv-chips';
import { FilterSpalte } from './filter-spalte';
import { AktivChip, FilterAchse, filterAchse, umschalten } from './filter.model';
import { SammlungWerkzeuge } from './sammlung-werkzeuge';

type Key = 'modul' | 'tag';

/** Wirt, der die drei Bausteine so verdrahtet wie die Uebersichten. */
@Component({
  selector: 'app-filter-wirt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterSpalte, AktivChips, SammlungWerkzeuge],
  template: `
    <app-filter-spalte
      [achsen]="achsen()"
      [hatFilter]="chips().length > 0"
      alleLabel="Alle Dinge"
      [gesamt]="7"
      einheit="Dinge"
      (schalte)="ereignisse.push('schalte:' + $event.key + ':' + $event.id)"
      (leere)="ereignisse.push('leere:' + $event)"
      (zuruecksetzen)="ereignisse.push('reset')"
    ></app-filter-spalte>
    <app-sammlung-werkzeuge
      [(suche)]="suche"
      platzhalter="Suchen…"
      trefferText="3 von 7"
      [gliederungen]="gliederungen()"
      [(gliederung)]="gliederung"
      [(ansicht)]="ansicht"
    ></app-sammlung-werkzeuge>
    <app-aktiv-chips
      [chips]="chips()"
      (entferne)="ereignisse.push('chip:' + $event.key + ':' + $event.id)"
    ></app-aktiv-chips>
  `,
})
class Wirt {
  readonly achsen = signal<FilterAchse<Key>[]>([
    {
      key: 'modul',
      label: 'Fachmodule',
      mono: true,
      aktiv: true,
      werte: [
        { id: 'enova', label: 'enova', n: 3, aktiv: true },
        { id: 'straf', label: 'straf', n: 0, aktiv: false },
      ],
    },
    { key: 'tag', label: 'Schlagworte', aktiv: false, werte: [] },
  ]);
  readonly chips = signal<AktivChip<Key>[]>([
    { achse: 'Modul', label: 'enova', key: 'modul', id: 'enova' },
  ]);
  readonly gliederungen = signal<{ id: string; label: string }[]>([
    { id: 'keine', label: 'Ohne Gliederung' },
    { id: 'modul', label: 'Nach Fachmodul' },
  ]);
  readonly suche = signal('');
  readonly gliederung = signal('modul');
  readonly ansicht = signal('kacheln');
  readonly ereignisse: string[] = [];
}

describe('Filter-Bausteine der Uebersichten', () => {
  let fixture: ComponentFixture<Wirt>;
  let el: HTMLElement;
  let wirt: Wirt;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Wirt] }).compileComponents();
    fixture = TestBed.createComponent(Wirt);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    wirt = fixture.componentInstance;
  });

  const klick = (sel: string): void => {
    (el.querySelector(sel) as HTMLElement).click();
    fixture.detectChanges();
  };

  it('zeigt Achsen, Werte und Zaehler; ein leerer Wert ist als solcher markiert', () => {
    expect(el.querySelector('.fAlle .fLabel')!.textContent).toBe('Alle Dinge');
    expect(el.querySelector('.fAlle .fZahl')!.textContent).toBe('7');
    expect(el.querySelector('.fAlle')!.classList).not.toContain('aktiv');
    const werte = Array.from(el.querySelectorAll<HTMLElement>('.fWert'));
    expect(werte.map((w) => w.title)).toEqual(['enova — 3 Dinge', 'straf — 0 Dinge']);
    expect(werte[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(werte[1]!.classList).toContain('leer');
    expect(werte[0]!.querySelector('.fLabel')!.classList).toContain('mono');
    // Nur die aktive Achse traegt das × zum Leeren.
    expect(el.querySelectorAll('.fAchseReset').length).toBe(1);
  });

  it('meldet Schalten, Leeren und Zuruecksetzen an die Ansicht', () => {
    klick('.fWert');
    klick('.fAchseReset');
    klick('.fReset');
    klick('.fAlle');
    expect(wirt.ereignisse).toEqual(['schalte:modul:enova', 'leere:modul', 'reset', 'reset']);
  });

  it('Chips nennen Achse und Wert und melden das Entfernen', () => {
    expect(el.querySelector('.aktivChips .aktivChip')!.textContent).toContain('enova');
    klick('.aktivChip');
    expect(wirt.ereignisse).toEqual(['chip:modul:enova']);
  });

  it('Werkzeugzeile schreibt Suche, Gliederung und Ansicht in die Signale der Ansicht', () => {
    const feld = el.querySelector<HTMLInputElement>('.dashSucheFeld input')!;
    feld.value = 'kopf';
    feld.dispatchEvent(new Event('input'));
    expect(wirt.suche()).toBe('kopf');

    const wahl = el.querySelector<HTMLSelectElement>('.dashGliederung')!;
    expect(wahl.value).toBe('modul');
    wahl.value = 'keine';
    wahl.dispatchEvent(new Event('change'));
    expect(wirt.gliederung()).toBe('keine');

    klick('.ansichtToggle button:last-child');
    expect(wirt.ansicht()).toBe('liste');
    expect(el.querySelector('.dashTreffer')!.textContent).toBe('3 von 7');
  });

  it('ohne Gliederungen entfallen Auswahl und Umschalter', () => {
    wirt.gliederungen.set([]);
    fixture.detectChanges();
    expect(el.querySelector('.dashGliederung')).toBeNull();
    expect(el.querySelector('.ansichtToggle')).toBeNull();
  });
});

describe('filter.model', () => {
  it('filterAchse zaehlt je Wert gegen die Grundmenge', () => {
    const a = filterAchse({
      key: 'modul',
      label: 'Fachmodule',
      basis: ['a', 'a', 'b'],
      werte: [
        { id: 'a', label: 'A' },
        { id: 'c', label: 'C' },
      ],
      gewaehlt: ['c'],
      trifft: (e, id) => e === id,
    });
    expect(a.aktiv).toBeTrue();
    expect(a.werte).toEqual([
      { id: 'a', label: 'A', n: 2, aktiv: false },
      { id: 'c', label: 'C', n: 0, aktiv: true },
    ]);
  });

  it('umschalten waehlt an und ab, ohne die Liste zu veraendern', () => {
    const liste = ['a'];
    expect(umschalten(liste, 'b')).toEqual(['a', 'b']);
    expect(umschalten(liste, 'a')).toEqual([]);
    expect(liste).toEqual(['a']);
  });
});
