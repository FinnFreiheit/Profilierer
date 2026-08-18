import { EnthaltenLage, istEnthalten } from './enthalten';

/**
 * Die eine Regel, pur getestet. Die Aufloesung der vier Angaben liegt bei
 * `StateService.enthaltenLage` und hat dort eigene Tests — hier steht nur die
 * Entscheidung selbst, damit ihre Reihenfolge festgeschrieben ist.
 */
describe('istEnthalten', () => {
  const lage = (teile: Partial<EnthaltenLage> = {}): EnthaltenLage => ({
    wirkung: null,
    min: 0,
    eigenerInhalt: false,
    inhaltDarunter: false,
    inAuswahl: false,
    ...teile,
  });

  it('ausgeschlossen schlaegt alles andere', () => {
    expect(
      istEnthalten(
        lage({ wirkung: 'ausgeschlossen', min: 3, eigenerInhalt: true, inhaltDarunter: true }),
      ),
    ).toBe(false);
  });

  it('zwingend ist enthalten, auch ohne Wert', () => {
    expect(istEnthalten(lage({ wirkung: 'pflicht' }))).toBe(true);
  });

  it('eine Mindestanzahl >= 1 traegt das Element ohne Statusstufe', () => {
    // Der Fall, an dem Schreib- und Leseregel auseinanderliefen: die
    // Untergrenze stammt aus der Profilierung, eine Wirkung gibt es nicht.
    expect(istEnthalten(lage({ min: 1 }))).toBe(true);
  });

  it('sonst entscheidet der Inhalt — am Element selbst oder darunter (ADR 0016)', () => {
    expect(istEnthalten(lage())).toBe(false);
    expect(istEnthalten(lage({ eigenerInhalt: true }))).toBe(true);
    expect(istEnthalten(lage({ inhaltDarunter: true }))).toBe(true);
  });

  it('in einer Auswahl traegt die Mindestanzahl nicht — nur die Wahl', () => {
    // Ein Zweig hat im Schema `minOccurs="1"`, gemeint ist aber „einer der
    // Zweige". Ohne diese Ausnahme galt jeder uebergangene Zweig als betreten,
    // und der Konformitaets-Abgleich meldete jede zwingende Festlegung darunter
    // als fehlenden Wert.
    expect(istEnthalten(lage({ min: 1, inAuswahl: true }))).toBe(false);
    // Gewaehlt wird ausdruecklich (die Fuehrung setzt `pflicht` am Zweig) …
    expect(istEnthalten(lage({ min: 1, inAuswahl: true, wirkung: 'pflicht' }))).toBe(true);
    // … oder ueber den Inhalt (ADR 0016).
    expect(istEnthalten(lage({ min: 1, inAuswahl: true, inhaltDarunter: true }))).toBe(true);
  });

  it('optional und markierung sind fuer sich genommen keine Aufnahme', () => {
    expect(istEnthalten(lage({ wirkung: 'optional' }))).toBe(false);
    expect(istEnthalten(lage({ wirkung: 'markierung' }))).toBe(false);
    // … aber sie stehen dem Inhalt nicht im Weg.
    expect(istEnthalten(lage({ wirkung: 'optional', eigenerInhalt: true }))).toBe(true);
  });
});
