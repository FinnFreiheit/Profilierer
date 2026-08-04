import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatentypPicker } from './datentyp-picker';
import { StateService } from '../../core/services/state.service';
import { XsdParserService } from '../../core/services/xsd-parser.service';
import { DatentypWahl } from '../../core/util/datentyp.util';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.gds.test.0001" type="Type.GDS.Akte"/>
  <xs:complexType name="Type.GDS.Akte">
    <xs:annotation><xs:documentation>Die Akte eines Verfahrens.</xs:documentation></xs:annotation>
  </xs:complexType>
  <xs:complexType name="Code.GDS.Aktentyp"/>
  <xs:simpleType name="datatypeC">
    <xs:annotation>
      <xs:appinfo><datentyp><nameLang>Datentyp C</nameLang></datentyp></xs:appinfo>
    </xs:annotation>
    <xs:restriction base="xs:string"/>
  </xs:simpleType>
</xs:schema>`;

describe('DatentypPicker', () => {
  let fixture: ComponentFixture<DatentypPicker>;
  let gemeldet: DatentypWahl[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DatentypPicker] }).compileComponents();
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const { idx } = TestBed.inject(XsdParserService).buildIndexFrom([
      { file: 'xjustiz_0000_test.xsd', dom },
    ]);
    TestBed.inject(StateService).idx.set(idx);
    fixture = TestBed.createComponent(DatentypPicker);
    gemeldet = [];
    fixture.componentRef.instance.gewaehlt.subscribe((w) => gemeldet.push(w));
    setzeWert({ datentyp: 'string' });
  });

  function setzeWert(w: DatentypWahl): void {
    fixture.componentRef.setInput('wert', w);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const knopf = (): HTMLButtonElement => el().querySelector('button')!;
  const oeffne = (): void => {
    knopf().click();
    fixture.detectChanges();
  };
  const eintraege = (): HTMLElement[] => [...el().querySelectorAll<HTMLElement>('.msgItem')];
  /** Die Eintraege ohne „Sonstiger…" — der ueberlebt jeden Filter. */
  const typEintraege = (): HTMLElement[] =>
    eintraege().filter((e) => !e.textContent?.includes('Sonstiger…'));
  const suchfeld = (): HTMLInputElement => el().querySelector('.typSuche')!;
  const tippe = (v: string): void => {
    const f = suchfeld();
    f.value = v;
    f.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const taste = (key: string): void => {
    suchfeld().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  };

  it('zeigt den aktuellen Typ auf dem Knopf', () => {
    expect(knopf().textContent).toContain('xs:string');
    setzeWert({ datentyp: 'Type.GDS.Akte', datentypQuelle: 'schema' });
    expect(knopf().textContent).toContain('Type.GDS.Akte');
    setzeWert({});
    expect(knopf().textContent).toContain('Container');
  });

  it('oeffnet erst auf Klick und zeigt dann die gruppierte Liste', () => {
    expect(el().querySelector('.typPanel')).toBeNull();
    oeffne();
    const gruppen = [...el().querySelectorAll('.msgGroup')].map((g) => g.textContent?.trim());
    expect(gruppen).toEqual([
      'Sonstiges',
      'Basistypen',
      'DIN 91379',
      'Fachliche Typen · GDS',
      'Codelisten',
    ]);
  });

  it('filtert ueber Name und Doku', () => {
    oeffne();
    tippe('verfahrens');
    expect(typEintraege().map((e) => e.textContent)).toEqual([
      jasmine.stringContaining('Type.GDS.Akte'),
    ]);
    tippe('gibtesnicht');
    expect(typEintraege().length).toBe(0);
    expect(el().textContent).toContain('keine Treffer');
  });

  it('meldet einen gewaehlten Schematyp mit seiner Herkunft und schliesst', () => {
    oeffne();
    tippe('Type.GDS.Akte');
    typEintraege()[0]!.click();
    fixture.detectChanges();
    expect(gemeldet).toEqual([{ datentyp: 'Type.GDS.Akte', datentypQuelle: 'schema' }]);
    expect(el().querySelector('.typPanel')).toBeNull();
  });

  it('meldet einen Basistyp als xs:-Herkunft', () => {
    oeffne();
    tippe('xs:token');
    typEintraege()[0]!.click();
    expect(gemeldet).toEqual([{ datentyp: 'token', datentypQuelle: 'xs' }]);
  });

  it('meldet den Container ohne Typ', () => {
    oeffne();
    tippe('Container');
    typEintraege()[0]!.click();
    expect(gemeldet).toEqual([{ datentyp: undefined, datentypQuelle: undefined }]);
  });

  it('nimmt ueber "Sonstiger…" einen Freitext-Typ auf', () => {
    oeffne();
    tippe('Sonstiger');
    eintraege()[0]!.click();
    fixture.detectChanges();
    // Die Liste bleibt offen: erst der Freitext macht die Wahl vollstaendig.
    expect(gemeldet).toEqual([]);
    const frei = el().querySelector<HTMLInputElement>('.typFrei')!;
    frei.value = ' Code.GDS.Neu ';
    frei.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(gemeldet).toEqual([{ datentyp: 'Code.GDS.Neu', datentypQuelle: 'frei' }]);
    expect(el().querySelector('.typPanel')).toBeNull();
  });

  it('markiert einen Typ, den das Schema nicht kennt', () => {
    expect(el().querySelector('.typWarn')).toBeNull();
    setzeWert({ datentyp: 'Code.GDS.Neu', datentypQuelle: 'frei' });
    expect(el().querySelector('.typWarn')?.textContent).toContain('nicht im Schema gefunden');
    // Ein Altbestands-Eintrag ohne Herkunft, den das Schema kennt, bleibt ruhig.
    setzeWert({ datentyp: 'Type.GDS.Akte' });
    expect(el().querySelector('.typWarn')).toBeNull();
  });

  it('zeigt den Klartext eines DIN-Typs neben dem Knopf', () => {
    setzeWert({ datentyp: 'datatypeC', datentypQuelle: 'schema' });
    expect(el().querySelector('.typInfo')?.textContent).toContain('Datentyp C (DIN 91379)');
  });

  it('laesst sich mit Pfeiltasten und Enter bedienen', () => {
    oeffne();
    tippe('xs:');
    // Vorn steht „Sonstiger…", dahinter die Basistypen in Schemareihenfolge.
    taste('ArrowDown');
    expect(eintraege()[1]!.classList).toContain('hot');
    taste('ArrowDown');
    expect(eintraege()[2]!.classList).toContain('hot');
    taste('ArrowUp');
    taste('Enter');
    expect(gemeldet).toEqual([{ datentyp: 'string', datentypQuelle: 'xs' }]);
  });

  it('schliesst auf Escape, ohne etwas zu melden', () => {
    oeffne();
    taste('Escape');
    expect(el().querySelector('.typPanel')).toBeNull();
    expect(gemeldet).toEqual([]);
  });

  it('bietet den Freitext auch dann an, wenn die Suche nichts findet', () => {
    oeffne();
    tippe('Beiaktengrund');
    // Genau dann braucht man ihn: der gesuchte Typ steht nicht im Schema.
    expect(eintraege().map((e) => e.textContent)).toEqual([jasmine.stringContaining('Sonstiger…')]);
  });

  it('uebernimmt den Suchtext ins Freitextfeld', () => {
    oeffne();
    tippe('Beiaktengrund');
    eintraege()[0]!.click();
    fixture.detectChanges();
    const frei = el().querySelector<HTMLInputElement>('.typFrei')!;
    expect(frei.value).toBe('Beiaktengrund');
    frei.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(gemeldet).toEqual([{ datentyp: 'Beiaktengrund', datentypQuelle: 'frei' }]);
  });

  it('haelt Escape im Freitextfeld beim Waehler auf', () => {
    // Ohne preventDefault schloesse Escape im <dialog> des Anlege-Dialogs den
    // ganzen Dialog samt eingetragenem Elementnamen.
    oeffne();
    tippe('Sonstiger');
    eintraege()[0]!.click();
    fixture.detectChanges();
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    el().querySelector<HTMLInputElement>('.typFrei')!.dispatchEvent(ev);
    fixture.detectChanges();
    expect(ev.defaultPrevented).toBeTrue();
    expect(el().querySelector('.typPanel')).toBeNull();
    expect(gemeldet).toEqual([]);
  });
});
