import { TestBed } from '@angular/core/testing';
import { Dashboard } from './dashboard';
import { LibraryEntry } from '../../models/profile.model';
import { ERW_SPERRE_GRUND } from '../../core/util/erweiterung-sperre';

/**
 * Fortschrittsbalken der Kachel (#93). Der Nenner kommt aus dem Stand der
 * Entscheidungspunkte, den der Client beim Speichern mitschreibt — fehlt er
 * (Altbestand), zeigt die Kachel keinen Balken statt einen erfundenen.
 */
describe('Dashboard — Fortschritt auf der Kachel', () => {
  let dash: {
    anteil: (e: LibraryEntry) => number | null;
    fortschritt: (e: LibraryEntry) => string;
    anteilText: (e: LibraryEntry) => string;
  };

  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({ id: 'x', name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 0, ...over }) as LibraryEntry;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();
    const fixture = TestBed.createComponent(Dashboard);
    dash = fixture.componentInstance as unknown as typeof dash;
  });

  it('rechnet den Anteil aus entschiedenen und gesamten Punkten', () => {
    expect(dash.anteil(eintrag({ nEntschieden: 12, nPunkte: 40 }))).toBeCloseTo(0.3);
    expect(dash.fortschritt(eintrag({ nEntschieden: 12, nPunkte: 40 }))).toBe(
      '12 von 40 entschieden',
    );
    expect(dash.anteilText(eintrag({ nEntschieden: 12, nPunkte: 40 }))).toBe('30 % entschieden');
  });

  it('liefert 0 statt null, wenn noch nichts entschieden ist', () => {
    // Wichtig fuer das Template: 0 ist falsy, darf den Balken aber nicht
    // verschwinden lassen — ein frisch begonnenes Profil zeigt einen leeren.
    expect(dash.anteil(eintrag({ nEntschieden: 0, nPunkte: 479 }))).toBe(0);
    expect(dash.fortschritt(eintrag({ nEntschieden: 0, nPunkte: 479 }))).toBe(
      '0 von 479 entschieden',
    );
  });

  it('zeigt bei vollstaendiger Entscheidung 100 Prozent', () => {
    expect(dash.anteil(eintrag({ nEntschieden: 40, nPunkte: 40 }))).toBe(1);
  });

  it('kennt keinen Anteil ohne mitgeschriebenen Stand', () => {
    expect(dash.anteil(eintrag({ nStatus: 360 }))).toBeNull();
    expect(dash.anteil(eintrag({ nEntschieden: 5 }))).toBeNull();
    expect(dash.anteil(eintrag({ nPunkte: 0, nEntschieden: 0 }))).toBeNull();
  });

  it('faellt im Altbestand auf die Festlegungen zurueck', () => {
    expect(dash.fortschritt(eintrag({ nStatus: 360, nAusp: 4 }))).toBe(
      '360 Festlegungen · 4 Ausprägungen',
    );
    expect(dash.fortschritt(eintrag())).toBe('noch leer');
  });
});

/**
 * Sperre der Testnachricht-Erstellung an der Kachel (#98). Der Eintrag bleibt
 * sichtbar und gesperrt — ein verschwundener Menuepunkt waere ein Raetsel.
 */
describe('Dashboard — Testnachricht bei Schema-Erweiterungen', () => {
  let dash: {
    erwSperre: (e: LibraryEntry) => boolean;
    testnachrichtTitel: (e: LibraryEntry) => string;
  };

  const eintrag = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
    ({ id: 'x', name: 'P', nStatus: 0, nAusp: 0, aktualisiert: 0, ...over }) as LibraryEntry;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();
    dash = TestBed.createComponent(Dashboard).componentInstance as unknown as typeof dash;
  });

  it('sperrt jede Profilierung mit Erweiterungen und nennt den Grund', () => {
    expect(dash.erwSperre(eintrag({ nErw: 1 }))).toBeTrue();
    expect(dash.testnachrichtTitel(eintrag({ nErw: 1 }))).toBe(ERW_SPERRE_GRUND);
  });

  it('laesst Profilierungen ohne Erweiterungen unveraendert', () => {
    expect(dash.erwSperre(eintrag({ nErw: 0 }))).toBeFalse();
    expect(dash.erwSperre(eintrag())).toBeFalse();
    expect(dash.testnachrichtTitel(eintrag())).toContain('geführter Durchlauf');
  });
});
