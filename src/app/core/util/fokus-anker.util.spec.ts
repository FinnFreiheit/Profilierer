import { FokusAnker } from './fokus-anker.util';

/**
 * Fokus halten beim Umbau des Baums (#Moduswechsel): der bearbeitete Kasten
 * bleibt an seiner Stelle im Ausschnitt, statt mit dem umgebauten Inhalt
 * wegzurutschen.
 */
describe('FokusAnker', () => {
  it('merkt sich die erste Lage und fuehrt dabei nicht nach', () => {
    const a = new FokusAnker();
    expect(a.nachfuehren('a/b', { top: 200, left: 40 })).toBeNull();
  });

  it('nennt die Differenz, wenn der Kasten nach dem Umbau verrutscht ist', () => {
    const a = new FokusAnker();
    a.merke('a/b', { top: 200, left: 40 });
    // Oberhalb sind Kaesten erschienen: derselbe Kasten steht 500px tiefer.
    expect(a.nachfuehren('a/b', { top: 700, left: 40 })).toEqual({ top: 500, left: 0 });
  });

  it('haelt den Anker fest, bis die Ansicht ihm gefolgt ist', () => {
    const a = new FokusAnker();
    a.merke('a/b', { top: 200, left: 40 });
    a.nachfuehren('a/b', { top: 700, left: 40 });
    // Die Ansicht ist nachgezogen — die Lage stimmt wieder, nichts zu tun.
    expect(a.nachfuehren('a/b', { top: 200, left: 40 })).toBeNull();
    // Und der naechste Umbau misst wieder gegen dieselbe Lage.
    expect(a.nachfuehren('a/b', { top: 260, left: 40 })).toEqual({ top: 60, left: 0 });
  });

  it('ignoriert Mess-Rauschen unterhalb eines Pixels', () => {
    const a = new FokusAnker();
    a.merke('a/b', { top: 200, left: 40 });
    expect(a.nachfuehren('a/b', { top: 200.4, left: 40.2 })).toBeNull();
  });

  it('fuehrt bei einem Wechsel der Auswahl nicht nach, sondern haelt fortan die neue', () => {
    const a = new FokusAnker();
    a.merke('a/b', { top: 200, left: 40 });
    // Anderer Kasten ausgewaehlt: seine Lage ist gewollt, nicht zu korrigieren.
    expect(a.nachfuehren('a/c', { top: 900, left: 300 })).toBeNull();
    expect(a.nachfuehren('a/c', { top: 950, left: 300 })).toEqual({ top: 50, left: 0 });
  });

  it('fuehrt nach dem Loesen nicht nach — der Sprung war gewollt', () => {
    const a = new FokusAnker();
    a.merke('a/b', { top: 200, left: 40 });
    a.loesen();
    expect(a.nachfuehren('a/b', { top: 700, left: 40 })).toBeNull();
  });
});
