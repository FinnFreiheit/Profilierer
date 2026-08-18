import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NeuesProfilWizard, AUTOR_STORAGE } from './neues-profil-wizard';
import { StateService } from '../../core/services/state.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { XsdParserService } from '../../core/services/xsd-parser.service';
import { NeuesProfil } from '../../core/services/persistence.service';
import { BundledVersion } from '../../models/schema-bundle.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.enova.entscheidung.2900003" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const VERSION_362: BundledVersion = {
  id: '3.6.2',
  label: '3.6.2',
  dir: '3.6.2',
  default: true,
  files: ['xjustiz_0000_test.xsd'],
};
const VERSION_400: BundledVersion = { id: '4.0.0', label: '4.0.0', dir: '4.0.0', files: [] };

/**
 * Der Wizard ist der einzige Weg in eine neue Profilierung — geprueft wird
 * darum die Reihenfolge (Version → Nachricht → Angaben) und dass der Eintrag
 * erst am Ende entsteht, mit allen Angaben.
 */
describe('NeuesProfilWizard', () => {
  let fixture: ComponentFixture<NeuesProfilWizard>;
  let state: StateService;
  let angelegt: NeuesProfil[];
  let geladen: string[];

  beforeEach(async () => {
    angelegt = [];
    geladen = [];
    await TestBed.configureTestingModule({
      imports: [NeuesProfilWizard],
      providers: [
        {
          provide: PersistenceService,
          useValue: {
            createNew: async (v?: NeuesProfil) => void (v && angelegt.push(v)),
            loadBundle: async (v: BundledVersion) => {
              geladen.push(v.dir);
              TestBed.inject(StateService).activeBundle.set(v.dir);
              return 1;
            },
          },
        },
      ],
    }).compileComponents();
    state = TestBed.inject(StateService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    state.idx.set(
      new XsdParserService().buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx,
    );
    state.bundledVersions.set([VERSION_362, VERSION_400]);
    state.activeBundle.set('3.6.2');
    localStorage.removeItem(AUTOR_STORAGE);
    fixture = TestBed.createComponent(NeuesProfilWizard);
    fixture.detectChanges();
    fixture.componentInstance.open();
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem(AUTOR_STORAGE));

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const knopf = (text: string): HTMLButtonElement =>
    [...el().querySelectorAll<HTMLButtonElement>('.wizFuss button')].find(
      (b) => b.textContent?.trim() === text,
    )!;
  const tippe = (id: string, wert: string): void => {
    const feld = el().querySelector<HTMLInputElement>(`#${id}`)!;
    feld.value = wert;
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const weiter = async (): Promise<void> => {
    knopf('Weiter').click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('startet auf der aktiven Datenbasis und laedt sie nicht erneut', async () => {
    expect(el().querySelector('.wizWahl.aktiv')!.textContent).toContain('3.6.2');
    await weiter();
    expect(geladen).toEqual([]);
    expect(el().textContent).toContain('nachricht.enova.entscheidung.2900003');
  });

  it('laedt eine abweichend gewaehlte Version vor der Nachrichtenauswahl', async () => {
    [...el().querySelectorAll<HTMLButtonElement>('.wizWahl')]
      .find((b) => b.textContent?.includes('4.0.0'))!
      .click();
    fixture.detectChanges();
    await weiter();
    expect(geladen).toEqual(['4.0.0']);
  });

  it('legt erst nach Titel und Autor an — mit Nachricht und Angaben', async () => {
    await weiter();
    el().querySelector<HTMLButtonElement>('.wizListe .wizWahl')!.click();
    fixture.detectChanges();

    expect(knopf('Anlegen').disabled).toBeTrue();
    tippe('wizTitel', 'Entscheidung an die StA');
    expect(knopf('Anlegen').disabled).toBeTrue();
    tippe('wizAutor', 'BLK-AG');
    tippe('wizBeschr', 'Übermittlung im eNoVA-Verfahren');
    expect(knopf('Anlegen').disabled).toBeFalse();

    knopf('Anlegen').click();
    await fixture.whenStable();
    expect(angelegt).toEqual([
      {
        nachricht: 'nachricht.enova.entscheidung.2900003',
        name: 'Entscheidung an die StA',
        autor: 'BLK-AG',
        beschreibung: 'Übermittlung im eNoVA-Verfahren',
      },
    ]);
    // Der Autor wiederholt sich zwischen Profilierungen — er wird gemerkt.
    expect(localStorage.getItem(AUTOR_STORAGE)).toBe('BLK-AG');
  });

  it('legt bei Abbruch nichts an', async () => {
    await weiter();
    el().querySelector<HTMLButtonElement>('.wizListe .wizWahl')!.click();
    fixture.detectChanges();
    tippe('wizTitel', 'X');
    tippe('wizAutor', 'Y');
    knopf('Abbrechen').click();
    await fixture.whenStable();
    expect(angelegt).toEqual([]);
  });

  it('filtert die Nachrichtenliste', async () => {
    await weiter();
    const suche = el().querySelector<HTMLInputElement>('.wizSuche')!;
    suche.value = 'gibtesnicht';
    suche.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el().querySelector('.wizLeer')!.textContent).toContain('keine Treffer');
  });
});
