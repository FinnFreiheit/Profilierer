import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KennzahlenRoute } from '../../models/kennzahlen.model';
import { BalkenDiagramm } from './balken-diagramm';

interface Innen {
  zeilen: () => { breite: number; fehlerBreite: number; titel: string }[];
  leer: () => boolean;
  hoehe: () => number;
}

describe('BalkenDiagramm', () => {
  let fixture: ComponentFixture<BalkenDiagramm>;
  let innen: Innen;

  const route = (r: string, zugriffe: number, fehler = 0): KennzahlenRoute => ({
    route: r,
    zugriffe,
    fehler,
    dauerMs: 12,
  });

  const mit = (routen: KennzahlenRoute[]): void => {
    fixture.componentRef.setInput('routen', routen);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BalkenDiagramm] });
    fixture = TestBed.createComponent(BalkenDiagramm);
    innen = fixture.componentInstance as unknown as Innen;
  });

  it('skaliert die Balken auf den Spitzenreiter', () => {
    mit([route('GET /api/profiles', 100), route('GET /api/projekte', 50)]);
    const [erst, zweit] = innen.zeilen();
    expect(erst!.breite).toBeGreaterThan(zweit!.breite);
    expect(zweit!.breite / erst!.breite).toBeCloseTo(0.5, 2);
  });

  it('bleibt bei leerer Liste und bei 0 Zugriffen endlich', () => {
    mit([]);
    expect(innen.leer()).toBeTrue();
    expect(innen.hoehe()).toBeGreaterThan(0);
    mit([route('GET /api/profiles', 0)]);
    expect(Number.isFinite(innen.zeilen()[0]!.breite)).toBeTrue();
  });

  it('haelt den Fehleranteil innerhalb des Balkens', () => {
    mit([route('GET /api/profiles', 10, 4), route('GET /api/projekte', 10, 20)]);
    for (const z of innen.zeilen()) expect(z.fehlerBreite).toBeLessThanOrEqual(z.breite);
  });
});
