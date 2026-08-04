import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ErweiterungDialog } from './erweiterung-dialog';
import { ErweiterungDialogService } from '../../core/services/erweiterung-dialog.service';
import { StateService } from '../../core/services/state.service';
import { XsdParserService } from '../../core/services/xsd-parser.service';

/** Schema mit DIN-91379-Typen — die Vorbelegung haengt an ihrer Anwesenheit. */
const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:simpleType name="datatypeC"><xs:restriction base="xs:string"/></xs:simpleType>
</xs:schema>`;

function index(xsd: string): ReturnType<XsdParserService['buildIndexFrom']>['idx'] {
  const dom = new DOMParser().parseFromString(xsd, 'application/xml');
  return new XsdParserService().buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx;
}

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
    state.idx.set(index(XSD));
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

  it('faellt ohne DIN 91379 im Schema auf xs:string zurueck', () => {
    // Sonst startete die Erweiterung bei einem Fremdschema im Warnzustand.
    state.idx.set(index('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>'));
    TestBed.inject(ErweiterungDialogService).oeffneNeu('nachricht.x/kopf', []);
    fixture.detectChanges();
    expect(typKnopf().textContent).toContain('xs:string');
  });

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
