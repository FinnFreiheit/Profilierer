import { datumKurz } from './datum.util';

/**
 * Das Kachel-Datum stand dreifach in den Ansichten (Profile, Testdaten,
 * Projekte) — hier steht die Regel einmal. Wichtig ist die Zweistelligkeit:
 * daran haengt, dass die Spalte untereinander bündig bleibt.
 */
describe('datumKurz', () => {
  it('formatiert Zeitstempel zweistellig mit fuehrenden Nullen', () => {
    // 03.08.2026, mittags — die Uhrzeit haelt die Zeitzone aus dem Datum raus.
    expect(datumKurz(new Date(2026, 7, 3, 12).getTime())).toBe('03.08.2026');
  });

  it('nimmt auch ein ISO-Datum (Feld `gespeichert`)', () => {
    expect(datumKurz('2026-07-24T12:00:00')).toBe('24.07.2026');
  });

  it('liefert leer statt "Invalid Date" — Leeres, Fehlendes, Unlesbares', () => {
    expect(datumKurz(undefined)).toBe('');
    expect(datumKurz(null)).toBe('');
    expect(datumKurz('')).toBe('');
    expect(datumKurz('kein Datum')).toBe('');
    expect(datumKurz(Number.NaN)).toBe('');
  });
});
