import { ProfileDoc } from '../models/profile.model';
import { kennzeichenLage } from './kennzeichen-lage';

const M = 'nachricht.test.0001';
const L = `${M}/beteiligung`;

const doc = (teile: Partial<ProfileDoc> = {}): ProfileDoc => ({
  meta: { name: 'P', nachricht: M },
  statuses: [],
  elemente: {},
  auspraegungen: {},
  erweiterungen: {},
  ...teile,
});

/** Zwei benannte Vorkommen — die kleinste Liste, an der es etwas zu trennen gibt. */
const zwei = {
  [L]: [
    { id: 'n1', name: 'Notar' },
    { id: 'n2', name: 'Antragsteller' },
  ],
};

describe('kennzeichenLage (#121)', () => {
  it('schlägt eine trennende Werte-Festlegung vor', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: zwei,
        elemente: {
          [`${L}@n1/rolle`]: { werte: ['notar'] },
          [`${L}@n2/rolle`]: { werte: ['antragsteller'] },
        },
      }),
    );

    expect(lage.length).toBe(1);
    expect(lage[0]!.listPfad).toBe(L);
    expect(lage[0]!.markiert).toEqual([]);
    expect(lage[0]!.kandidaten.map((k) => k.suffix)).toEqual(['rolle']);
    expect(lage[0]!.kandidaten[0]!.trennung).toBe('vollstaendig');
    expect(lage[0]!.kandidaten[0]!.offen).toEqual([]);
  });

  it('schweigt zu einer Festlegung, deren Werte sich überschneiden', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: zwei,
        elemente: {
          [`${L}@n1/rolle`]: { werte: ['notar', 'sonstige'] },
          [`${L}@n2/rolle`]: { werte: ['sonstige'] },
        },
      }),
    );
    expect(lage).toEqual([]);
  });

  it('behandelt eine Ausprägung ohne Werte als Joker — sie ist von keiner getrennt', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: zwei,
        elemente: { [`${L}@n1/rolle`]: { werte: ['notar'] } },
      }),
    );
    // Nur n1 hat Werte: das trennt kein Paar, also kein Vorschlag.
    expect(lage).toEqual([]);
  });

  it('meldet teilweise Trennung mit den offen bleibenden Ausprägungen', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: {
          [L]: [
            { id: 'n1', name: 'Notar' },
            { id: 'n2', name: 'Antragsteller' },
            { id: 'n3', name: 'Antragsgegner' },
          ],
        },
        elemente: {
          [`${L}@n1/rolle`]: { werte: ['notar'] },
          [`${L}@n2/rolle`]: { werte: ['beteiligter'] },
          [`${L}@n3/rolle`]: { werte: ['beteiligter'] },
        },
      }),
    );

    expect(lage[0]!.kandidaten[0]!.trennung).toBe('teilweise');
    expect(lage[0]!.kandidaten[0]!.offen.sort()).toEqual(['Antragsgegner', 'Antragsteller']);
  });

  it('meldet ein markiertes Kennzeichen ohne Trennwirkung — und schlägt es nicht vor', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: zwei,
        elemente: {
          [`${L}@n1/rolle`]: { werte: ['sonstige'], kennzeichnend: true },
          [`${L}@n2/rolle`]: { werte: ['sonstige'], kennzeichnend: true },
        },
      }),
    );

    expect(lage[0]!.markiert).toEqual(['rolle']);
    expect(lage[0]!.ohneTrennwirkung).toEqual(['rolle']);
    expect(lage[0]!.kandidaten).toEqual([]);
  });

  it('schweigt zu einer Liste, deren Kennzeichen trennt — dort ist nichts zu tun', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: zwei,
        elemente: {
          [`${L}@n1/rolle`]: { werte: ['notar'], kennzeichnend: true },
          [`${L}@n2/rolle`]: { werte: ['antragsteller'], kennzeichnend: true },
        },
      }),
    );
    expect(lage).toEqual([]);
  });

  it('lässt eine Liste mit nur einem benannten Vorkommen aus — nichts zu trennen', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: { [L]: [{ id: 'n1', name: 'Notar' }] },
        elemente: { [`${L}@n1/rolle`]: { werte: ['notar'] } },
      }),
    );
    expect(lage).toEqual([]);
  });

  it('ignoriert tiefere Vorkommen und Erweiterungen unter dem Vorkommen', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: zwei,
        elemente: {
          // Unter einem geschachtelten Vorkommen — gehört zur inneren Liste.
          [`${L}@n1/anschrift@a1/typ`]: { werte: ['kanzlei'] },
          [`${L}@n2/anschrift@a1/typ`]: { werte: ['privat'] },
          // Nachbeauftragtes Element.
          [`${L}@n1/~zusatz`]: { werte: ['x'] },
          [`${L}@n2/~zusatz`]: { werte: ['y'] },
        },
      }),
    );
    expect(lage).toEqual([]);
  });

  it('sortiert vollständige Trennung vor teilweise', () => {
    const lage = kennzeichenLage(
      doc({
        auspraegungen: {
          [L]: [
            { id: 'n1', name: 'A' },
            { id: 'n2', name: 'B' },
            { id: 'n3', name: 'C' },
          ],
        },
        elemente: {
          [`${L}@n1/halb`]: { werte: ['x'] },
          [`${L}@n2/halb`]: { werte: ['y'] },
          [`${L}@n3/halb`]: { werte: ['y'] },
          [`${L}@n1/ganz`]: { werte: ['1'] },
          [`${L}@n2/ganz`]: { werte: ['2'] },
          [`${L}@n3/ganz`]: { werte: ['3'] },
        },
      }),
    );
    expect(lage[0]!.kandidaten.map((k) => k.suffix)).toEqual(['ganz', 'halb']);
  });
});
