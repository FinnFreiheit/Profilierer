import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KeinAutofillDirective } from './kein-autofill.directive';

@Component({
  selector: 'app-autofill-wirt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeinAutofillDirective],
  template: `
    <input id="text" type="text" />
    <input id="ohneTyp" />
    <textarea id="mehrzeilig"></textarea>
    <input id="haken" type="checkbox" />
    <input id="datei" type="file" />
    <input id="geheim" type="password" />
  `,
})
class AutofillWirt {}

/**
 * Die Direktive haelt Browser und Passwortverwalter aus den Eingaben heraus
 * (Tippen im Baum-Editor wurde davon spuerbar traege). Passwort-, Datei- und
 * Auswahlfelder bleiben unangetastet.
 */
describe('KeinAutofillDirective', () => {
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AutofillWirt] }).compileComponents();
    const fix = TestBed.createComponent(AutofillWirt);
    fix.detectChanges();
    el = fix.nativeElement as HTMLElement;
  });

  const feld = (id: string): HTMLElement => el.querySelector('#' + id)!;

  it('schaltet Autofill in Textfeldern, typlosen Eingaben und Textflaechen ab', () => {
    for (const id of ['text', 'ohneTyp', 'mehrzeilig']) {
      expect(feld(id).getAttribute('autocomplete')).toBe('off', id);
      expect(feld(id).hasAttribute('data-1p-ignore')).toBe(true, id);
      expect(feld(id).getAttribute('data-lpignore')).toBe('true', id);
    }
  });

  it('laesst Haken-, Datei- und Passwortfelder aus', () => {
    for (const id of ['haken', 'datei', 'geheim']) {
      expect(feld(id).hasAttribute('autocomplete')).toBe(false, id);
    }
  });
});
