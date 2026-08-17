import { kennzeichenZuordnung } from './vorkommen-matching';
import { InstanzModell } from './vorgabe-sicht';
import { ProfileDoc } from '../models/profile.model';

/**
 * Die Erfuellbarkeits-Zuordnung (#116) ist pur: alle Tests reichen zwei
 * Dokumente hinein und pruefen die Zuordnung, den Ausweis und die
 * Fehlbetrags-Klassifikation — die Entscheidungen aus dem Grilling vom
 * 26.08.12, jede an ihrem Beispiel.
 */
describe('kennzeichenZuordnung', () => {
  const M = 'nachricht.test.0001';
  const BET = `${M}/beteiligung`;
  const ROLLE = 'rolle/rollenbezeichnung';
  const P = 'w1';

  const vorgabe = (teile: Partial<ProfileDoc> = {}): ProfileDoc => ({
    meta: {},
    statuses: [
      { id: P, name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' },
      { id: 'w2', name: 'optional', farbe: '#0a0', wirkung: 'optional' },
    ],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
    ...teile,
  });

  const instanz = (teile: Partial<InstanzModell> = {}): InstanzModell => ({
    elemente: {},
    auspraegungen: {},
    ...teile,
  });

  const nie = (): boolean => false;

  /** Vorgabe: Notar (Rolle 22) und Betreuer (Rolle 07), beide zwingend. */
  const zweiRollen = (): ProfileDoc =>
    vorgabe({
      elemente: {
        [`${BET}@n1`]: { status: P },
        [`${BET}@n1/${ROLLE}`]: { werte: ['22'], kennzeichnend: true },
        [`${BET}@b1`]: { status: P },
        [`${BET}@b1/${ROLLE}`]: { werte: ['07'], kennzeichnend: true },
      },
      auspraegungen: {
        [BET]: [
          { id: 'n1', name: 'Notar' },
          { id: 'b1', name: 'Betreuer' },
        ],
      },
    });

  it('ordnet ueber Kennzeichen zu und weist die Zuordnung nachpruefbar aus', () => {
    // Die Nachricht traegt die Vorkommen in umgekehrter Reihenfolge — die
    // Zuordnung folgt dem Rollenwert, nicht der Position.
    const inst = instanz({
      elemente: {
        [`${BET}@v1/${ROLLE}`]: { beispiel: '07' },
        [`${BET}@v2/${ROLLE}`]: { beispiel: '22' },
      },
      auspraegungen: {
        [BET]: [
          { id: 'v1', name: 'Vorkommen 1' },
          { id: 'v2', name: 'Vorkommen 2' },
        ],
      },
    });

    const z = kennzeichenZuordnung(inst, zweiRollen(), nie);

    expect(z.zugeordnet.has(BET)).toBeTrue();
    const liste = z.modell.auspraegungen[BET]!;
    expect(liste.find((a) => a.id === 'v1')!.vonId).toBe('b1');
    expect(liste.find((a) => a.id === 'v2')!.vonId).toBe('n1');
    // Der Ausweis nennt Paar und Nachweis.
    const eintraege = z.listen[0]!.eintraege;
    expect(eintraege.length).toBe(2);
    const notar = eintraege.find((e) => e.auspName === 'Notar')!;
    expect(notar.vorkommenName).toBe('Vorkommen 2');
    expect(notar.kennzeichen).toEqual(['rollenbezeichnung = 22']);
    expect(z.listen[0]!.fehlbetraege).toEqual([]);
    expect(z.listen[0]!.unaufgenommen).toEqual([]);
  });

  it('laesst das hereingereichte Modell unangetastet', () => {
    const inst = instanz({
      elemente: { [`${BET}@v1/${ROLLE}`]: { beispiel: '22' } },
      auspraegungen: { [BET]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });

    kennzeichenZuordnung(inst, zweiRollen(), nie);

    expect(inst.auspraegungen[BET]![0]!.vonId).toBeUndefined();
  });

  it('meldet einen unvermeidbaren Fehlbetrag, wenn kein Vorkommen die Kennzeichen traegt', () => {
    const inst = instanz({
      elemente: { [`${BET}@v1/${ROLLE}`]: { beispiel: '22' } },
      auspraegungen: { [BET]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });

    const z = kennzeichenZuordnung(inst, zweiRollen(), nie);

    const f = z.listen[0]!.fehlbetraege;
    expect(f.length).toBe(1);
    expect(f[0]!.auspName).toBe('Betreuer');
    expect(f[0]!.klasse).toBe('unvermeidbar');
    expect(f[0]!.kandidaten).toEqual([]);
  });

  it('klassifiziert konkurrierende zwingende Auspraegungen als austauschbar', () => {
    // Zwei zwingende Notar-Auspraegungen, ein Notar-Vorkommen: eine bleibt
    // unbelegt, aber welche, ist Willkuer — der Bericht darf keine einzelne
    // anklagen (Grilling Frage 4).
    const doc = vorgabe({
      elemente: {
        [`${BET}@n1`]: { status: P },
        [`${BET}@n1/${ROLLE}`]: { werte: ['22'], kennzeichnend: true },
        [`${BET}@n2`]: { status: P },
        [`${BET}@n2/${ROLLE}`]: { werte: ['22'], kennzeichnend: true },
      },
      auspraegungen: {
        [BET]: [
          { id: 'n1', name: 'Notar A' },
          { id: 'n2', name: 'Notar B' },
        ],
      },
    });
    const inst = instanz({
      elemente: { [`${BET}@v1/${ROLLE}`]: { beispiel: '22' } },
      auspraegungen: { [BET]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });

    const z = kennzeichenZuordnung(inst, doc, nie);

    const f = z.listen[0]!.fehlbetraege;
    expect(f.length).toBe(1);
    expect(f[0]!.klasse).toBe('austauschbar');
    expect(f[0]!.kandidaten).toEqual(['Vorkommen 1']);
  });

  it('nimmt auf statt abzuweisen: Aufnahme geht vor Verstossarmut', () => {
    // Grilling Frage 9: zwingend „Beteiligter" (ohne Kennzeichen), optional
    // „Notar mit Anschrift". Nachricht: ein Rechtsanwalt, ein Notar OHNE
    // Anschrift. Der Notar wird aufgenommen und an seinen Anforderungen
    // gemessen („Anschrift fehlt") — nicht als fremd abgetan.
    const doc = vorgabe({
      elemente: {
        [`${BET}@x1`]: { status: P },
        [`${BET}@o1`]: { status: 'w2' },
        [`${BET}@o1/${ROLLE}`]: { werte: ['22'], kennzeichnend: true },
        [`${BET}@o1/anschrift`]: { status: P },
      },
      auspraegungen: {
        [BET]: [
          { id: 'x1', name: 'Beteiligter' },
          { id: 'o1', name: 'Notar' },
        ],
      },
    });
    const inst = instanz({
      elemente: {
        [`${BET}@v1/${ROLLE}`]: { beispiel: '03' },
        [`${BET}@v2/${ROLLE}`]: { beispiel: '22' },
      },
      auspraegungen: {
        [BET]: [
          { id: 'v1', name: 'Vorkommen 1' },
          { id: 'v2', name: 'Vorkommen 2' },
        ],
      },
    });

    const z = kennzeichenZuordnung(inst, doc, nie, {
      istEnthalten: (p) => !p.endsWith('/anschrift'),
    });

    const liste = z.modell.auspraegungen[BET]!;
    // Der Notar traegt Verstosskosten (Anschrift fehlt) und wird trotzdem
    // aufgenommen; der Rechtsanwalt belegt den Joker.
    expect(liste.find((a) => a.id === 'v2')!.vonId).toBe('o1');
    expect(liste.find((a) => a.id === 'v1')!.vonId).toBe('x1');
    expect(z.listen[0]!.unaufgenommen).toEqual([]);
  });

  it('minimiert unter gleicher Aufnahme die Verstoesse des Paars', () => {
    // Eine zwingende Notar-Auspraegung mit einer weiteren (nicht
    // kennzeichnenden) Werte-Festlegung; zwei Notar-Vorkommen. Zugeordnet wird
    // das, das auch die weitere Festlegung erfuellt.
    const doc = vorgabe({
      elemente: {
        [`${BET}@n1`]: { status: P },
        [`${BET}@n1/${ROLLE}`]: { werte: ['22'], kennzeichnend: true },
        [`${BET}@n1/anschrift/ort`]: { werte: ['Berlin'] },
      },
      auspraegungen: { [BET]: [{ id: 'n1', name: 'Notar' }] },
    });
    const inst = instanz({
      elemente: {
        [`${BET}@v1/${ROLLE}`]: { beispiel: '22' },
        [`${BET}@v1/anschrift/ort`]: { beispiel: 'Hamburg' },
        [`${BET}@v2/${ROLLE}`]: { beispiel: '22' },
        [`${BET}@v2/anschrift/ort`]: { beispiel: 'Berlin' },
      },
      auspraegungen: {
        [BET]: [
          { id: 'v1', name: 'Vorkommen 1' },
          { id: 'v2', name: 'Vorkommen 2' },
        ],
      },
    });

    const z = kennzeichenZuordnung(inst, doc, nie);

    const liste = z.modell.auspraegungen[BET]!;
    expect(liste.find((a) => a.id === 'v2')!.vonId).toBe('n1');
    expect(liste.find((a) => a.id === 'v1')!.vonId).toBeUndefined();
    expect(z.listen[0]!.unaufgenommen).toEqual(['Vorkommen 1']);
  });

  it('ruehrt Listen ohne Kennzeichen nicht an (Bestandsprofilierungen)', () => {
    const doc = vorgabe({
      elemente: {
        [`${BET}@n1`]: { status: P },
        [`${BET}@n1/${ROLLE}`]: { werte: ['22'] }, // Werteliste, aber nicht kennzeichnend
      },
      auspraegungen: { [BET]: [{ id: 'n1', name: 'Notar' }] },
    });
    const inst = instanz({
      elemente: { [`${BET}@v1/${ROLLE}`]: { beispiel: '22' } },
      auspraegungen: { [BET]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });

    const z = kennzeichenZuordnung(inst, doc, nie);

    expect(z.zugeordnet.size).toBe(0);
    expect(z.listen).toEqual([]);
    expect(z.modell.auspraegungen[BET]![0]!.vonId).toBeUndefined();
  });

  it('ignoriert ein Kennzeichen an einem nachbeauftragten Element', () => {
    // Gefunden beim Bau von #121: die Erweiterungs-Pruefung sah nur den Suffix
    // und griff daher erst ab der zweiten Ebene — ein `~`-Element direkt unter
    // dem Vorkommen rutschte durch. Ein Kennzeichen dort waere **nie**
    // erfuellbar (eine gueltige Nachricht kann das Element nicht enthalten),
    // die Auspraegung damit unbelegbar und der Fehlbetrag eine falsche Anklage.
    const doc = vorgabe({
      elemente: {
        [`${BET}@n1`]: { status: P },
        [`${BET}@n1/~eigenes`]: { werte: ['x'], kennzeichnend: true },
      },
      auspraegungen: { [BET]: [{ id: 'n1', name: 'Notar' }] },
    });
    const inst = instanz({
      elemente: { [`${BET}@v1/${ROLLE}`]: { beispiel: '22' } },
      auspraegungen: { [BET]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });

    const z = kennzeichenZuordnung(inst, doc, nie);

    // Kein Kennzeichen in der Liste → wie eine Bestandsprofilierung behandelt,
    // statt die zwingende Auspraegung als fehlend anzuklagen.
    expect(z.listen).toEqual([]);
    expect(z.zugeordnet.size).toBe(0);
  });

  it('ueberspringt Listen, die die Namens-Zuordnung bereits abdeckt', () => {
    const inst = instanz({
      elemente: { [`${BET}@v1/${ROLLE}`]: { beispiel: '22' } },
      auspraegungen: { [BET]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });

    const z = kennzeichenZuordnung(inst, zweiRollen(), (p) => p === BET);

    expect(z.zugeordnet.size).toBe(0);
    expect(z.listen).toEqual([]);
  });

  it('ordnet innere Listen nach den aeusseren zu (von aussen nach innen)', () => {
    // Anschriften unterhalb des Notars: die innere Liste ist der Vorgabe erst
    // bekannt, wenn das aeussere Vorkommen zugeordnet ist (quellPfad ueber
    // vonId). Ein zweiter Anschrifts-Typ dient als inneres Kennzeichen.
    const doc = vorgabe({
      elemente: {
        [`${BET}@n1`]: { status: P },
        [`${BET}@n1/${ROLLE}`]: { werte: ['22'], kennzeichnend: true },
        [`${BET}@n1/anschrift@k1`]: { status: P },
        [`${BET}@n1/anschrift@k1/anschriftstyp`]: { werte: ['003'], kennzeichnend: true },
      },
      auspraegungen: {
        [BET]: [{ id: 'n1', name: 'Notar' }],
        [`${BET}@n1/anschrift`]: [{ id: 'k1', name: 'Kanzleianschrift' }],
      },
    });
    const inst = instanz({
      elemente: {
        [`${BET}@v1/${ROLLE}`]: { beispiel: '22' },
        [`${BET}@v1/anschrift@w1/anschriftstyp`]: { beispiel: '001' },
        [`${BET}@v1/anschrift@w2/anschriftstyp`]: { beispiel: '003' },
      },
      auspraegungen: {
        [BET]: [{ id: 'v1', name: 'Vorkommen 1' }],
        [`${BET}@v1/anschrift`]: [
          { id: 'w1', name: 'Vorkommen 1' },
          { id: 'w2', name: 'Vorkommen 2' },
        ],
      },
    });

    const z = kennzeichenZuordnung(inst, doc, nie);

    expect(z.zugeordnet.has(`${BET}@v1/anschrift`)).toBeTrue();
    const innen = z.modell.auspraegungen[`${BET}@v1/anschrift`]!;
    expect(innen.find((a) => a.id === 'w2')!.vonId).toBe('k1');
    expect(innen.find((a) => a.id === 'w1')!.vonId).toBeUndefined();
  });

  it('weist eine zu grosse Liste ehrlich als uebersprungen aus', () => {
    const ausps = Array.from({ length: 13 }, (_, i) => ({ id: `a${i}`, name: `A${i}` }));
    const elemente: ProfileDoc['elemente'] = {};
    for (const a of ausps)
      elemente[`${BET}@${a.id}/${ROLLE}`] = { werte: ['22'], kennzeichnend: true };
    const doc = vorgabe({ elemente, auspraegungen: { [BET]: ausps } });
    const inst = instanz({
      elemente: { [`${BET}@v1/${ROLLE}`]: { beispiel: '22' } },
      auspraegungen: { [BET]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });

    const z = kennzeichenZuordnung(inst, doc, nie);

    expect(z.zugeordnet.size).toBe(0);
    expect(z.listen[0]!.uebersprungen).toContain('zu groß');
  });

  it('prueft ein Kennzeichen ueber wiederholbare Zwischenelemente (eine Rolle genuegt)', () => {
    const inst = instanz({
      elemente: {
        [`${BET}@v1/rolle@r1/rollenbezeichnung`]: { beispiel: '99' },
        [`${BET}@v1/rolle@r2/rollenbezeichnung`]: { beispiel: '22' },
      },
      auspraegungen: {
        [BET]: [{ id: 'v1', name: 'Vorkommen 1' }],
        [`${BET}@v1/rolle`]: [
          { id: 'r1', name: 'Vorkommen 1' },
          { id: 'r2', name: 'Vorkommen 2' },
        ],
      },
    });

    const z = kennzeichenZuordnung(inst, zweiRollen(), nie);

    expect(z.modell.auspraegungen[BET]![0]!.vonId).toBe('n1');
  });
});
