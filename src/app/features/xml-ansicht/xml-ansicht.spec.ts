import { ComponentFixture, TestBed } from '@angular/core/testing';
import { XmlAnsicht } from './xml-ansicht';
import { StateService } from '../../core/services/state.service';
import { ExportService } from '../../core/services/export.service';
import { NavService } from '../../core/services/nav.service';
import { TreeService } from '../../core/services/tree.service';
import { XsdParserService } from '../../core/services/xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';

/** Kleines Schema wie in `export.service.spec` — genug fuer eine Nachricht. */
const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0001';

describe('XmlAnsicht', () => {
  let fixture: ComponentFixture<XmlAnsicht>;
  let state: StateService;
  let nav: NavService;
  let exporter: ExportService;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [XmlAnsicht] }).compileComponents();
    state = TestBed.inject(StateService);
    nav = TestBed.inject(NavService);
    exporter = TestBed.inject(ExportService);
    const tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    const idx = parser.buildIndexFrom(docs).idx;
    state.idx.set(idx);
    state.version.set('3.6.2');
    state.root.set(tree.buildRoot(M, idx));
    state.msgName.set(M);
    fixture = TestBed.createComponent(XmlAnsicht);
  });

  it('zeigt die Nachricht Zeile fuer Zeile mit Nummern', () => {
    fixture.detectChanges();
    const zeilen = el().querySelectorAll('.xmlZeile');
    expect(zeilen.length).toBeGreaterThan(1);
    expect(zeilen[0]!.querySelector('.xmlNr')?.textContent?.trim()).toBe('1');
    expect(el().textContent).toContain('Beispiel-Nachricht');
  });

  it('hebt die Zeile des ausgewaehlten Elements hervor', () => {
    state.selItem.set(nav.findItemByPath(`${M}/kopf`)!);
    fixture.detectChanges();

    const aktiv = el().querySelectorAll<HTMLElement>('.xmlZeile.aktiv');
    expect(aktiv.length).toBeGreaterThan(0);
    expect(aktiv[0]!.textContent).toContain('<kopf');
  });

  it('springt beim Klick auf eine Zeile zum zugehoerigen Feld', () => {
    fixture.detectChanges();
    const jump = spyOn(nav, 'jumpTo');
    const pfade = exporter.buildBeispielXmlMitPfaden()!.zeilenPfade;
    // Erste Zeile mit Bezug zum Baum — die Rahmenzeilen sind gesperrt.
    const erste = Array.from(el().querySelectorAll<HTMLButtonElement>('.xmlZeile')).find(
      (b) => !b.disabled,
    )!;
    const nr = Number(erste.querySelector('.xmlNr')!.textContent!.trim());

    erste.click();

    expect(jump).toHaveBeenCalledWith(pfade.get(nr)!);
  });

  it('laesst Zeilen ohne Bezug zum Baum gesperrt', () => {
    fixture.detectChanges();
    const erste = el().querySelector<HTMLButtonElement>('.xmlZeile')!;
    // Zeile 1 ist die XML-Deklaration: nichts zum Anspringen.
    expect(erste.disabled).toBe(true);
    expect(erste.textContent).toContain('<?xml');
  });

  it('nennt im Fuss die Zahl der Elemente und die XJustiz-Version', () => {
    fixture.detectChanges();
    const anzahl = new Set(exporter.buildBeispielXmlMitPfaden()!.zeilenPfade.values()).size;

    const fuss = el().querySelector('.xmlFuss')!.textContent!;
    expect(fuss).toContain(`${anzahl} Elemente`);
    expect(fuss).toContain('offene Auswahl');
    expect(fuss).toContain('XJustiz 3.6.2');
  });

  it('zeigt ohne Nachricht den leeren Zustand statt einer leeren Karte', () => {
    state.msgName.set(null);
    fixture.detectChanges();

    expect(el().querySelector('.xmlKarte')).toBeNull();
    expect(el().querySelector('.dashLeer')?.textContent).toContain('keine Nachricht');
  });
});
