import { konkreterPfad, positionsKette, positionsPfad, stellenTeile } from './positions-pfad.util';

/**
 * Der Positionspfad ist die gemeinsame Adresse mehrerer Nachrichten
 * (Ueberlagerung #147). Geprueft wird beides: die Uebersetzung hin (ids →
 * Stellen) und zurueck (Stellen → ids des Zielbaums) — und die Faelle, in denen
 * es **keine** Uebersetzung gibt.
 */
describe('positions-pfad.util', () => {
  const M = 'nachricht.test.0001';
  const listen = {
    [`${M}/beteiligung`]: [
      { id: 'v1', name: 'Vorkommen 1' },
      { id: 'v2', name: 'Vorkommen 2' },
    ],
    [`${M}/beteiligung@v2/anschrift`]: [
      { id: 'v7', name: 'Vorkommen 1' },
      { id: 'v8', name: 'Vorkommen 2' },
    ],
  };

  it('lässt Pfade ohne Vorkommen unberührt', () => {
    expect(positionsPfad(`${M}/vorname`, listen)).toBe(`${M}/vorname`);
    expect(konkreterPfad(`${M}/vorname`, listen)).toBe(`${M}/vorname`);
  });

  it('ersetzt die Vorkommens-id durch ihre Stellung', () => {
    expect(positionsPfad(`${M}/beteiligung@v2/name`, listen)).toBe(`${M}/beteiligung[2]/name`);
  });

  it('zählt innere Listen im Raum ihres äußeren Vorkommens', () => {
    expect(positionsPfad(`${M}/beteiligung@v2/anschrift@v8/ort`, listen)).toBe(
      `${M}/beteiligung[2]/anschrift[2]/ort`,
    );
  });

  it('weist eine unbekannte id als [?] aus, statt sie zu verschlucken', () => {
    // Sonst träfe der Pfad auf einen fremden und behauptete Gleichheit.
    expect(positionsPfad(`${M}/beteiligung@fremd/name`, listen)).toBe(`${M}/beteiligung[?]/name`);
    expect(konkreterPfad(`${M}/beteiligung[?]/name`, listen)).toBeNull();
  });

  it('übersetzt zurück in die ids des Zielbaums', () => {
    expect(konkreterPfad(`${M}/beteiligung[2]/anschrift[1]/ort`, listen)).toBe(
      `${M}/beteiligung@v2/anschrift@v7/ort`,
    );
  });

  it('lässt die erste Stelle weg, wo der Zielbaum keine Vorkommen führt', () => {
    // Ein einzelnes Vorkommen wird ohne Ausprägungs-Kasten gerendert.
    expect(konkreterPfad(`${M}/dokument[1]/id`, listen)).toBe(`${M}/dokument/id`);
  });

  it('hat für eine höhere Stelle ohne Liste keinen Ort', () => {
    expect(konkreterPfad(`${M}/dokument[2]/id`, listen)).toBeNull();
    expect(konkreterPfad(`${M}/beteiligung[3]/name`, listen)).toBeNull();
  });

  it('zerlegt eine Stelle in Listenpfad und Nummer', () => {
    expect(stellenTeile(`${M}/beteiligung[2]`)).toEqual({ listenPfad: `${M}/beteiligung`, n: 2 });
    expect(stellenTeile(`${M}/beteiligung`)).toBeNull();
  });

  it('liefert die Präfixkette samt Trägerelement vor jeder Stelle', () => {
    expect(positionsKette(`${M}/beteiligung[2]/name`)).toEqual([
      M,
      `${M}/beteiligung`,
      `${M}/beteiligung[2]`,
      `${M}/beteiligung[2]/name`,
    ]);
  });
});
