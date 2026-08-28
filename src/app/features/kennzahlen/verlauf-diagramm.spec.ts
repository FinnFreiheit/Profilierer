import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KennzahlenTag } from '../../models/kennzahlen.model';
import { VerlaufDiagramm } from './verlauf-diagramm';

/** Zugriff auf die geschuetzten Anzeige-Ableitungen (Muster: dashboard.spec.ts). */
interface Innen {
  linie: () => string;
  flaeche: () => string;
  punkte: () => { wert: number }[];
  leer: () => boolean;
  vorlesetext: () => string;
  achse: () => { x: number; text: string }[];
}

describe('VerlaufDiagramm', () => {
  let fixture: ComponentFixture<VerlaufDiagramm>;
  let innen: Innen;

  const tag = (t: string, zugriffe: number, klienten = 0): KennzahlenTag => ({
    tag: t,
    zugriffe,
    klienten,
    fehler: 0,
  });

  const mit = (tage: KennzahlenTag[], reihe: 'zugriffe' | 'klienten' = 'zugriffe'): void => {
    fixture.componentRef.setInput('tage', tage);
    fixture.componentRef.setInput('reihe', reihe);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [VerlaufDiagramm] });
    fixture = TestBed.createComponent(VerlaufDiagramm);
    innen = fixture.componentInstance as unknown as Innen;
  });

  it('zeichnet einen Pfad ohne NaN', () => {
    mit([tag('2026-08-01', 3), tag('2026-08-02', 9), tag('2026-08-03', 0)]);
    expect(innen.linie()).not.toContain('NaN');
    expect(innen.flaeche()).not.toContain('NaN');
    expect(innen.leer()).toBeFalse();
  });

  it('sagt bei zu wenig Daten Bescheid, statt eine leere Flaeche zu zeigen', () => {
    mit([]);
    expect(innen.leer()).toBeTrue();
    expect(innen.flaeche()).toBe('');
    mit([tag('2026-08-01', 5)]);
    expect(innen.leer()).toBeTrue();
    // Ein einzelner Tag: ein Punkt, keine Division durch null.
    expect(innen.punkte().length).toBe(1);
  });

  it('folgt der gewaehlten Reihe', () => {
    const tage = [tag('2026-08-01', 40, 2), tag('2026-08-02', 60, 3)];
    mit(tage, 'zugriffe');
    expect(innen.punkte().map((p) => p.wert)).toEqual([40, 60]);
    mit(tage, 'klienten');
    expect(innen.punkte().map((p) => p.wert)).toEqual([2, 3]);
  });

  it('duennt die Achsenbeschriftung aus und nennt den Hoechstwert vorlesbar', () => {
    mit(Array.from({ length: 30 }, (_, i) => tag(`2026-08-${String(i + 1).padStart(2, '0')}`, i)));
    expect(innen.achse().length).toBeLessThanOrEqual(8);
    expect(innen.vorlesetext()).toContain('Höchstwert 29');
  });
});
