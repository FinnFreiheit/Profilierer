import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Objektleiste } from './objektleiste';
import { StateService } from '../../core/services/state.service';

/**
 * Kopfzeile (Editor v4): der Szenario-Name ist selbst das Eingabefeld, und
 * saemtliche Werkzeuge stehen im ⋯-Menue. Getestet wird genau das — die
 * Modus-Logik der Primaeraktion ist unveraendert und anderswo abgedeckt.
 */
describe('Objektleiste — Kopfzeile', () => {
  let fixture: ComponentFixture<Objektleiste>;
  let state: StateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Objektleiste] }).compileComponents();
    state = TestBed.inject(StateService);
    state.root.set({ path: 'r', name: 'r' } as never);
    fixture = TestBed.createComponent(Objektleiste);
    fixture.detectChanges();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /** ⋯ aufklappen und die Eintraege des Menues als Text zurueckgeben. */
  const menuTexte = (): string[] => {
    el().querySelector<HTMLButtonElement>('.mWeiteres')!.click();
    fixture.detectChanges();
    return [...el().querySelectorAll('.menuPanel .menuItem')].map((b) =>
      (b.textContent || '').trim(),
    );
  };

  it('zeigt im Profil-Modus den Szenario-Namen als Eingabefeld', () => {
    const feld = el().querySelector<HTMLInputElement>('.kopfName');
    expect(feld).toBeTruthy();
    expect(feld!.id).toBe('profilName');
    expect(el().querySelector('.objName')).toBeNull();
  });

  it('fuehrt „Grundlage…" im ⋯-Menue', () => {
    expect(menuTexte().some((t) => t.startsWith('Grundlage…'))).toBe(true);
  });

  it('legt die frueher in der Leiste stehenden Werkzeuge ins ⋯-Menue', () => {
    const texte = menuTexte();
    for (const erwartet of [
      'Angaben zum Szenario…',
      'Antworten anpassen…',
      'Frühere Fassungen…',
      'Pflichtfelder vorbelegen',
      'Drucken',
      'Profil laden…',
    ])
      expect(texte.some((t) => t.startsWith(erwartet)))
        .withContext(erwartet)
        .toBe(true);
    // Keine Doppelung mehr in der Leiste selbst.
    expect(el().querySelector('.zoneWerkzeuge')).toBeNull();
  });

  it('meldet den Wunsch nach der Grundlage nach aussen', () => {
    let gerufen = 0;
    fixture.componentInstance.grundlageClick.subscribe(() => gerufen++);

    menuTexte();
    [...el().querySelectorAll<HTMLButtonElement>('.menuPanel .menuItem')]
      .find((b) => (b.textContent || '').trim().startsWith('Grundlage…'))!
      .click();

    expect(gerufen).toBe(1);
  });

  it('zeigt den Namen im Betrachten-Modus als Text statt als Feld', () => {
    state.patchMeta({ name: 'Nachlass-Szenario' });
    state.readOnly.set(true);
    fixture.detectChanges();

    expect(el().querySelector('.kopfName')).toBeNull();
    expect(el().querySelector('.objName')?.textContent).toContain('Nachlass-Szenario');
  });
});
