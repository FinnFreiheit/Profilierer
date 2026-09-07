import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Bibliothek } from './bibliothek';
import { StateService } from '../../core/services/state.service';
import { AG_KEY_STORAGE } from '../../core/services/rolle.service';

/** Wirt mit beiden Einschueben — so, wie die Ansichten den Rahmen benutzen. */
@Component({
  selector: 'app-bibliothek-wirt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Bibliothek],
  template: `<app-bibliothek [aktiv]="'dashboard'" [mitFilter]="mitFilter()">
    <div filter><button class="fWert">Achse</button></div>
    <p class="inhalt">Sammlung</p>
  </app-bibliothek>`,
})
class Wirt {
  readonly mitFilter = signal(true);
}

/**
 * Der gemeinsame Rahmen der Bibliotheks-Ansichten (Etappe B1): Reiterleiste,
 * Schema-Suche und Badges standen zuvor in fuenf Templates kopiert. Geprueft
 * wird, was die Ansichten von ihm erwarten — welche Reiter er zeigt, dass der
 * aktive nicht anklickbar ist, und wohin die Einschuebe landen.
 */
describe('Bibliothek — gemeinsamer Rahmen', () => {
  let fixture: ComponentFixture<Wirt>;
  let el: HTMLElement;

  const bauen = async (): Promise<void> => {
    await TestBed.configureTestingModule({ imports: [Wirt] }).compileComponents();
    fixture = TestBed.createComponent(Wirt);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  };

  const reiter = (): string[] =>
    Array.from(el.querySelectorAll('.viewToggle button')).map((b) => b.textContent!.trim());

  afterEach(() => localStorage.removeItem(AG_KEY_STORAGE));

  it('zeigt vier Reiter ohne AG-Rolle — Kennzahlen bleiben aus', async () => {
    localStorage.removeItem(AG_KEY_STORAGE);
    await bauen();
    expect(reiter()).toEqual(['Projekte', 'Profile', 'Testdaten', 'Anleitung']);
  });

  it('nimmt die Kennzahlen erst mit angemeldeter AG-Rolle dazu', async () => {
    localStorage.setItem(AG_KEY_STORAGE, 'geheim');
    await bauen();
    expect(reiter()).toEqual(['Projekte', 'Profile', 'Testdaten', 'Anleitung', 'Kennzahlen']);
  });

  it('stellt den aktiven Reiter gesperrt dar', async () => {
    await bauen();
    const aktiv = el.querySelector<HTMLButtonElement>('.viewToggle button.active')!;
    expect(aktiv.textContent!.trim()).toBe('Profile');
    expect(aktiv.disabled).toBeTrue();
    // Genau einer ist aktiv — sonst zeigte die Leiste zwei Orte zugleich.
    expect(el.querySelectorAll('.viewToggle button.active').length).toBe(1);
  });

  it('schaltet die Ansicht um, wenn ein anderer Reiter geklickt wird', async () => {
    await bauen();
    const state = TestBed.inject(StateService);
    const td = Array.from(el.querySelectorAll<HTMLButtonElement>('.viewToggle button')).find(
      (b) => b.textContent!.trim() === 'Testdaten',
    )!;
    td.click();
    expect(state.view()).toBe('testdaten');
  });

  it('traegt die Schema-Suche in der Kopfleiste', async () => {
    await bauen();
    expect(el.querySelector('.dashLeiste app-schema-suche')).toBeTruthy();
  });

  it('setzt den filter-Einschub in die Filterspalte und den Rest in .dashMain', async () => {
    await bauen();
    const aside = el.querySelector('aside.dashFilter');
    expect(aside).toBeTruthy();
    expect(aside!.getAttribute('aria-label')).toBe('Eingrenzen');
    expect(aside!.querySelector('.fWert')).toBeTruthy();
    expect(el.querySelector('main.dashMain .inhalt')).toBeTruthy();
  });

  it('laesst die Filterspalte weg, wenn die Ansicht keine Achsen hat', async () => {
    await bauen();
    fixture.componentInstance.mitFilter.set(false);
    fixture.detectChanges();
    expect(el.querySelector('aside.dashFilter')).toBeNull();
    expect(el.querySelector('.dashKoerper')!.classList).toContain('ohneFilter');
    expect(el.querySelector('main.dashMain .inhalt')).toBeTruthy();
  });
});
