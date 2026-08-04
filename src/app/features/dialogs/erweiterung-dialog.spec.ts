import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ErweiterungDialog } from './erweiterung-dialog';
import { ErweiterungDialogService } from '../../core/services/erweiterung-dialog.service';
import { StateService } from '../../core/services/state.service';

/**
 * Der Anlege-Dialog holt den Datentyp seit #96 aus dem Typwaehler statt aus
 * einer eigenen Auswahlliste — die Liste wurde vorher an zwei Stellen gepflegt.
 */
describe('ErweiterungDialog — Datentyp', () => {
  let fixture: ComponentFixture<ErweiterungDialog>;
  let state: StateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ErweiterungDialog] }).compileComponents();
    state = TestBed.inject(StateService);
    fixture = TestBed.createComponent(ErweiterungDialog);
    fixture.detectChanges();
    TestBed.inject(ErweiterungDialogService).oeffneNeu('nachricht.x/kopf', []);
    fixture.detectChanges();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const typKnopf = (): HTMLButtonElement => el().querySelector('.typKnopf')!;
  const anlegen = (name: string): void => {
    const feld = el().querySelector<HTMLInputElement>('input[type=text]')!;
    feld.value = name;
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    [...el().querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Anlegen')!
      .click();
    fixture.detectChanges();
  };

  it('belegt neue Erweiterungen mit datatypeC vor', () => {
    // Haeufigster Typ im Schema (907 Verwendungen in 3.6.2) statt xs:string.
    expect(typKnopf().textContent).toContain('datatypeC');
    anlegen('zusatzAngabe');
    expect(state.erweiterungenOf('nachricht.x/kopf')![0]).toEqual(
      jasmine.objectContaining({
        name: 'zusatzAngabe',
        datentyp: 'datatypeC',
        datentypQuelle: 'schema',
      }),
    );
  });

  it('uebernimmt die Wahl des Typwaehlers samt Herkunft', () => {
    fixture.debugElement
      .query((d) => d.name === 'app-datentyp-picker')
      .componentInstance.gewaehlt.emit({ datentyp: 'Type.GDS.Akte', datentypQuelle: 'schema' });
    fixture.detectChanges();
    expect(typKnopf().textContent).toContain('Type.GDS.Akte');
    anlegen('akte');
    expect(state.erweiterungenOf('nachricht.x/kopf')![0]).toEqual(
      jasmine.objectContaining({ datentyp: 'Type.GDS.Akte', datentypQuelle: 'schema' }),
    );
  });

  it('legt einen Container ohne Datentyp an', () => {
    fixture.debugElement
      .query((d) => d.name === 'app-datentyp-picker')
      .componentInstance.gewaehlt.emit({ datentyp: undefined, datentypQuelle: undefined });
    fixture.detectChanges();
    anlegen('gruppe');
    const e = state.erweiterungenOf('nachricht.x/kopf')![0]!;
    expect(e.datentyp).toBeUndefined();
    expect(e.datentypQuelle).toBeUndefined();
  });
});
