import { VorkommenAusp, VorkommenGruppe, vorkommenRegeln } from './schematron-vorkommen';

const LIST = '/xj:nachricht.test.0001/xj:beteiligung';

const gruppe = (auspraegungen: VorkommenAusp[]): VorkommenGruppe => ({
  listXPath: LIST,
  listLabel: 'Beteiligung',
  auspraegungen,
});

/** Eine Ausprägung mit trennendem Kennzeichen an `rolle`. */
const mitRolle = (
  id: string,
  name: string,
  wert: string,
  rest: VorkommenAusp['festlegungen'] = [],
) =>
  ({
    id,
    name,
    zwingend: false,
    festlegungen: [{ rel: ['rolle'], label: 'rolle', werte: [wert], kennzeichnend: true }, ...rest],
  }) satisfies VorkommenAusp;

describe('vorkommenRegeln (#120)', () => {
  it('benennt das Vorkommen über sein Kennzeichen-Prädikat', () => {
    const { regeln, luecken } = vorkommenRegeln(
      gruppe([
        mitRolle('n1', 'Notar', '22', [
          { rel: ['anschrift'], label: 'anschrift', wirkung: 'pflicht' },
        ]),
        mitRolle('b1', 'Betreuer', '07'),
      ]),
    );

    expect(luecken).toEqual([]);
    const r = regeln.find((x) => x.test === 'xj:anschrift')!;
    expect(r.ctx).toBe(`${LIST}[xj:rolle = ('22')]`);
    expect(r.msg).toContain('„Notar"');
  });

  it('fordert für eine zwingende Ausprägung ein Vorkommen mit ihren Kennzeichen', () => {
    const { regeln } = vorkommenRegeln(
      gruppe([
        { ...mitRolle('n1', 'Notar', '22'), zwingend: true },
        mitRolle('b1', 'Betreuer', '07'),
      ]),
    );
    const r = regeln.find((x) => x.test.startsWith('count('))!;
    expect(r.ctx).toBe('/xj:nachricht.test.0001');
    expect(r.test).toBe("count(xj:beteiligung[xj:rolle = ('22')]) >= 1");
  });

  it('schweigt und benennt die Lücke, wo die Kennzeichen nicht trennen', () => {
    // Beide lassen Rolle 22 zu — welches Vorkommen welches ist, entscheidet
    // erst die Zuordnung. Knotenweise Regeln muessten hier raten.
    const { regeln, luecken } = vorkommenRegeln(
      gruppe([
        mitRolle('n1', 'Notar', '22', [
          { rel: ['anschrift'], label: 'anschrift', wirkung: 'pflicht' },
        ]),
        mitRolle('n2', 'Zweitnotar', '22'),
      ]),
    );

    expect(regeln).toEqual([]);
    expect(luecken.length).toBe(1);
    expect(luecken[0]).toContain('„Notar" und „Zweitnotar"');
    expect(luecken[0]).toContain('nicht');
  });

  it('schweigt, wo eine Ausprägung mit Festlegungen gar kein Kennzeichen trägt', () => {
    const { regeln, luecken } = vorkommenRegeln(
      gruppe([
        mitRolle('n1', 'Notar', '22'),
        {
          id: 'j1',
          name: 'Beteiligter',
          zwingend: true,
          festlegungen: [{ rel: ['name'], label: 'name', wirkung: 'pflicht' }],
        },
      ]),
    );
    expect(regeln).toEqual([]);
    expect(luecken[0]).toContain('„Beteiligter" ohne Kennzeichen');
  });

  it('setzt den Werte-Test bei Codelisten auf das code-Kind, die Anwesenheit aufs Element', () => {
    const { regeln } = vorkommenRegeln(
      gruppe([
        mitRolle('n1', 'Notar', '22', [
          {
            rel: ['farbe'],
            label: 'farbe',
            werte: ['rot — kräftig'],
            wirkung: 'pflicht',
            codelist: true,
          },
        ]),
        mitRolle('b1', 'Betreuer', '07'),
      ]),
    );
    expect(regeln.some((r) => r.test === 'xj:farbe')).toBeTrue();
    expect(regeln.some((r) => r.test === "xj:farbe/xj:code = ('rot')")).toBeTrue();
    // Kein doppeltes code-Segment.
    expect(regeln.every((r) => !r.test.includes('xj:code/xj:code'))).toBeTrue();
  });

  it('legt tiefere Festlegungen in den Kontext unter dem Prädikat', () => {
    const { regeln } = vorkommenRegeln(
      gruppe([
        mitRolle('n1', 'Notar', '22', [
          { rel: ['anschrift', 'ort'], label: 'anschrift/ort', wirkung: 'pflicht' },
        ]),
        mitRolle('b1', 'Betreuer', '07'),
      ]),
    );
    const r = regeln.find((x) => x.test === 'xj:ort')!;
    expect(r.ctx).toBe(`${LIST}[xj:rolle = ('22')]/xj:anschrift`);
  });

  it('gibt nichts aus, wo keine Ausprägung etwas festlegt', () => {
    expect(
      vorkommenRegeln(gruppe([{ id: 'n1', name: 'Notar', zwingend: false, festlegungen: [] }])),
    ).toEqual({ regeln: [], luecken: [] });
  });
});
