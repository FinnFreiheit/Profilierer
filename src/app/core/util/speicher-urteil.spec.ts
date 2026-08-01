import { speicherUrteil } from './speicher-urteil';

/** Die Prioritaetsmatrix des Speicher-Urteils — pur, ohne TestBed. */
describe('speicherUrteil', () => {
  const verstoss = (pfad = 'm/az'): { pfad: string; text: string } => ({
    pfad,
    text: 'nicht freigegeben',
  });

  it('ohne Befunde: kein Entwurf, keine vorrangige Meldung', () => {
    expect(speicherUrteil({ verstoesse: [] })).toEqual({ entwurf: false, meldung: null });
  });

  it('Verstoesse machen den Entwurf und stellen die klickbare Meldung', () => {
    const u = speicherUrteil({ verstoesse: [verstoss()] });
    expect(u.entwurf).toBeTrue();
    expect(u.meldung?.art).toBe('verstoesse');
    expect(u.meldung?.toast).toContain('1 Abweichung von der Profilierung');
    expect(u.meldung?.eintraege).toEqual([{ pfad: 'm/az', text: 'nicht freigegeben' }]);
  });

  it('Plural im Toast', () => {
    const u = speicherUrteil({ verstoesse: [verstoss('a'), verstoss('b')] });
    expect(u.meldung?.toast).toContain('2 Abweichungen');
  });

  it('Verstoesse gehen Schemafehlern vor — der Befund nennt das Szenario, nicht die Syntax', () => {
    const u = speicherUrteil({
      verstoesse: [verstoss()],
      schemaEintraege: [{ text: 'Schemafehler' }],
    });
    expect(u.meldung?.art).toBe('verstoesse');
    expect(u.entwurf).toBeTrue();
  });

  it('Schemafehler allein: Entwurf mit Schema-Meldung', () => {
    const u = speicherUrteil({ verstoesse: [], schemaEintraege: [{ text: 'Schemafehler' }] });
    expect(u.entwurf).toBeTrue();
    expect(u.meldung?.art).toBe('schemafehler');
    expect(u.meldung?.eintraege).toEqual([{ text: 'Schemafehler' }]);
  });

  it('offene Pflichtpunkte machen den Entwurf, melden aber nicht vorrangig', () => {
    // Der Text ist Sache des Aufrufers (nur das gefuehrte Erstellen kennt
    // Pflichtpunkte) — das Kennzeichen nicht.
    const u = speicherUrteil({ verstoesse: [], kritischOffen: 2 });
    expect(u.entwurf).toBeTrue();
    expect(u.meldung).toBeNull();
  });

  it('eine leere Schemaliste zaehlt als Befund — unpruefbar blockiert auch ohne Detailzeilen', () => {
    const u = speicherUrteil({ verstoesse: [], schemaEintraege: [] });
    expect(u.entwurf).toBeTrue();
    expect(u.meldung?.art).toBe('schemafehler');
  });

  it('null heisst valide bzw. ungeprueft — kein Entwurf', () => {
    expect(
      speicherUrteil({ verstoesse: [], schemaEintraege: null, kritischOffen: 0 }).entwurf,
    ).toBeFalse();
  });
});
