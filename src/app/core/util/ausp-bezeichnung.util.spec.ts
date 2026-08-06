import {
  AuspListen,
  auspSchluessel,
  bezeichnungenAnwenden,
  bezeichnungenAus,
} from './ausp-bezeichnung.util';

const M = 'nachricht.test.0001';

describe('ausp-bezeichnung.util', () => {
  describe('auspSchluessel', () => {
    it('laesst einen Pfad ohne Vorkommen unveraendert', () => {
      expect(auspSchluessel(`${M}/beteiligter`, () => 0)).toBe(`${M}/beteiligter`);
    });

    it('ersetzt jede id durch ihre Position — auch verschachtelt', () => {
      const pos = new Map([
        ['aA', 1],
        ['aB', 0],
      ]);
      expect(auspSchluessel(`${M}/beteiligter@aA/anschrift@aB`, (id) => pos.get(id))).toBe(
        `${M}/beteiligter@#1/anschrift@#0`,
      );
    });

    it('meldet einen unbekannten Pfad ab (null statt Rateschluessel)', () => {
      expect(auspSchluessel(`${M}/beteiligter@aWeg`, () => undefined)).toBeNull();
    });
  });

  /** Zwei Vorkommen unter `beteiligter`, das erste mit einer Unterliste. */
  function listen(namen = ['Kläger', 'Beklagter'], unter = ['Privat']): AuspListen {
    return [
      [`${M}/beteiligter`, namen.map((name, i) => ({ id: 'a' + i, name }))],
      [`${M}/beteiligter@a0/anschrift`, unter.map((name, i) => ({ id: 'u' + i, name }))],
    ];
  }

  it('sammelt die Namen unter stabilen Schluesseln ein', () => {
    expect(bezeichnungenAus(listen())).toEqual({
      [`${M}/beteiligter`]: ['Kläger', 'Beklagter'],
      [`${M}/beteiligter@#0/anschrift`]: ['Privat'],
    });
  });

  it('uebergeht leere Listen', () => {
    const leer: AuspListen = [[`${M}/beteiligter`, []]];
    expect(bezeichnungenAus(leer)).toEqual({});
  });

  it('haelt den Rundlauf durch neu vergebene ids aus', () => {
    const bez = bezeichnungenAus(listen());
    // Naechste Sitzung: dieselbe Struktur, aber frische ids aus dem Import.
    const frisch: AuspListen = [
      [
        `${M}/beteiligter`,
        [
          { id: 'x9', name: 'Vorkommen 1' },
          { id: 'x8', name: 'Vorkommen 2' },
        ],
      ],
      [`${M}/beteiligter@x9/anschrift`, [{ id: 'x7', name: 'Vorkommen 1' }]],
    ];

    expect(bezeichnungenAnwenden(frisch, bez)).toEqual([
      { pfad: `${M}/beteiligter`, id: 'x9', name: 'Kläger' },
      { pfad: `${M}/beteiligter`, id: 'x8', name: 'Beklagter' },
      { pfad: `${M}/beteiligter@x9/anschrift`, id: 'x7', name: 'Privat' },
    ]);
  });

  it('meldet nur Abweichungen', () => {
    const gleich = listen();
    expect(bezeichnungenAnwenden(gleich, bezeichnungenAus(gleich))).toEqual([]);
  });

  it('haelt fehlende und ueberzaehlige Namen aus', () => {
    const bez = { [`${M}/beteiligter`]: ['Kläger', '', 'Streithelfer'] };
    const frisch: AuspListen = [
      [
        `${M}/beteiligter`,
        [
          { id: 'x1', name: 'Vorkommen 1' },
          { id: 'x2', name: 'Vorkommen 2' },
        ],
      ],
    ];

    expect(bezeichnungenAnwenden(frisch, bez)).toEqual([
      { pfad: `${M}/beteiligter`, id: 'x1', name: 'Kläger' },
    ]);
  });

  it('ignoriert Schluessel, zu denen es keine Liste mehr gibt', () => {
    const frisch: AuspListen = [[`${M}/beteiligter`, [{ id: 'x1', name: 'Vorkommen 1' }]]];
    expect(bezeichnungenAnwenden(frisch, { [`${M}/zeuge`]: ['Zeuge A'] })).toEqual([]);
  });
});
