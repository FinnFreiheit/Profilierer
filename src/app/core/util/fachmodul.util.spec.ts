import { OHNE_FACHMODUL, fachmodulOf, nachFachmodul } from './fachmodul.util';

describe('fachmodulOf', () => {
  it('liest das Kuerzel aus dem zweiten Segment', () => {
    expect(fachmodulOf('nachricht.enova.entscheidung.2900003')).toBe('enova');
    expect(fachmodulOf('nachricht.gds.uebermittlungSchriftgutobjekte.0005005')).toBe('gds');
    expect(fachmodulOf('nachricht.dabag.antrag.2900001')).toBe('dabag');
  });

  it('meldet kein Modul, wo das Muster nicht passt', () => {
    expect(fachmodulOf(null)).toBe(OHNE_FACHMODUL);
    expect(fachmodulOf(undefined)).toBe(OHNE_FACHMODUL);
    expect(fachmodulOf('')).toBe(OHNE_FACHMODUL);
    // Freitext statt Nachrichtenname
    expect(fachmodulOf('mein Entwurf')).toBe(OHNE_FACHMODUL);
    // Zu kurz: Modul ohne folgendes Segment ist kein Nachrichtenname
    expect(fachmodulOf('nachricht.enova')).toBe(OHNE_FACHMODUL);
    // Anderer Praefix
    expect(fachmodulOf('code.enova.etwas.1')).toBe(OHNE_FACHMODUL);
  });
});

describe('nachFachmodul', () => {
  const eintraege = [
    { n: 'nachricht.straf.anklage.1' },
    { n: 'nachricht.enova.entscheidung.2900003' },
    { n: null },
    { n: 'nachricht.enova.mitteilung.2900004' },
    { n: 'nachricht.dabag.antrag.2900001' },
  ];

  it('gruppiert alphabetisch, Sammelgruppe zuletzt', () => {
    const g = nachFachmodul(eintraege, (e) => e.n);
    expect(g.map((x) => x.modul)).toEqual(['dabag', 'enova', 'straf', OHNE_FACHMODUL]);
  });

  it('fasst gleiche Module zusammen', () => {
    const g = nachFachmodul(eintraege, (e) => e.n);
    expect(g.find((x) => x.modul === 'enova')?.items.length).toBe(2);
  });

  it('behaelt die Eingabereihenfolge innerhalb einer Gruppe', () => {
    const g = nachFachmodul(eintraege, (e) => e.n);
    expect(g.find((x) => x.modul === 'enova')?.items.map((i) => i.n)).toEqual([
      'nachricht.enova.entscheidung.2900003',
      'nachricht.enova.mitteilung.2900004',
    ]);
  });

  it('verliert nichts', () => {
    const g = nachFachmodul(eintraege, (e) => e.n);
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(eintraege.length);
  });

  it('kommt mit leerer Eingabe klar', () => {
    expect(nachFachmodul([], () => null)).toEqual([]);
  });
});
