import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KennzahlenStoreService } from '../../core/services/kennzahlen-store.service';
import { RolleService } from '../../core/services/rolle.service';
import { StateService } from '../../core/services/state.service';
import { Kennzahlen as KennzahlenModel } from '../../models/kennzahlen.model';
import { Kennzahlen } from './kennzahlen';
import { signal } from '@angular/core';

/** Zugriff auf die geschuetzten Anzeige-Ableitungen (Muster: dashboard.spec.ts). */
interface Innen {
  dauerText: (ms: number) => string;
  prozentText: (anteil: number) => string;
  abnahmeQuote: () => number;
  fortschrittQuote: () => number;
  fehlerQuote: () => number;
  stundenbalken: () => { hoehe: number }[];
  stundenprofilLeer: () => boolean;
}

describe('Kennzahlen', () => {
  let fixture: ComponentFixture<Kennzahlen>;
  let innen: Innen;
  let daten: ReturnType<typeof signal<KennzahlenModel | null>>;

  const beispiel = (): KennzahlenModel => ({
    erzeugt: Date.now(),
    zeitraum: { von: '2026-08-01', bis: '2026-08-28', tage: 28 },
    nutzung: {
      heute: { zugriffe: 10, klienten: 2, fehler: 0, dauerMs: 8 },
      fenster: { zugriffe: 200, klienten: 5, fehler: 4, dauerMs: 1500 },
      ohneKennung: 3,
      wiederkehrend: 2,
      verlauf: [],
      stundenprofil: [...Array(23).fill(0), 40],
      routen: [],
    },
    bestand: {
      profile: 8,
      profileAbgenommen: 2,
      profileMitOffenenHinweisen: 1,
      punkteEntschieden: 30,
      punkteGesamt: 120,
      testnachrichten: 12,
      testnachrichtenAbgenommen: 3,
      testnachrichtenEntwuerfe: 1,
      projekte: 1,
      hinweiseOffen: 4,
      hinweiseGesamt: 9,
      schemaVersionen: 2,
      zuletztAktualisiert: 1,
    },
  });

  beforeEach(() => {
    daten = signal<KennzahlenModel | null>(beispiel());
    TestBed.configureTestingModule({
      imports: [Kennzahlen],
      providers: [
        {
          provide: KennzahlenStoreService,
          useValue: {
            daten,
            laedt: signal(false),
            fehler: signal<string | null>(null),
            refresh: () => Promise.resolve(),
          },
        },
        { provide: RolleService, useValue: { agAktiv: () => true } },
      ],
    });
    fixture = TestBed.createComponent(Kennzahlen);
    innen = fixture.componentInstance as unknown as Innen;
    fixture.detectChanges();
  });

  it('schreibt Antwortzeiten lesbar', () => {
    expect(innen.dauerText(87)).toBe('87 ms');
    expect(innen.dauerText(0.4)).toBe('0,4 ms');
    expect(innen.dauerText(1500)).toBe('1,5 s');
    // Ohne Zugriffe gibt es keine Zeit — ein "0 ms" waere eine Behauptung.
    expect(innen.dauerText(0)).toBe('—');
  });

  it('rundet Anteile und nennt kleine Werte genauer', () => {
    expect(innen.prozentText(25)).toBe('25 %');
    expect(innen.prozentText(2)).toBe('2,0 %');
    expect(innen.prozentText(0)).toBe('0 %');
  });

  it('leitet die Quoten aus dem Bestand ab', () => {
    expect(innen.abnahmeQuote()).toBe(25);
    expect(innen.fortschrittQuote()).toBe(25);
    expect(innen.fehlerQuote()).toBe(2);
  });

  it('kommt ohne Daten aus, statt durch null zu teilen', () => {
    daten.set(null);
    fixture.detectChanges();
    expect(innen.abnahmeQuote()).toBe(0);
    expect(innen.fortschrittQuote()).toBe(0);
    expect(innen.fehlerQuote()).toBe(0);
    expect(innen.stundenprofilLeer()).toBeTrue();
  });

  it('skaliert das Tagesprofil auf seinen Hoechstwert', () => {
    const balken = innen.stundenbalken();
    expect(balken.length).toBe(24);
    expect(balken[23]!.hoehe).toBeGreaterThan(0);
    expect(balken[0]!.hoehe).toBe(0);
    expect(innen.stundenprofilLeer()).toBeFalse();
  });

  it('faellt ohne AG-Rolle zurueck in die Bibliothek', () => {
    TestBed.resetTestingModule();
    const view = TestBed.configureTestingModule({
      imports: [Kennzahlen],
      providers: [
        {
          provide: KennzahlenStoreService,
          useValue: {
            daten: signal(null),
            laedt: signal(false),
            fehler: signal<string | null>(null),
            refresh: () => Promise.resolve(),
          },
        },
        { provide: RolleService, useValue: { agAktiv: () => false } },
      ],
    }).inject(StateService).view;
    view.set('kennzahlen');
    TestBed.createComponent(Kennzahlen).detectChanges();
    expect(view()).toBe('dashboard');
  });
});
