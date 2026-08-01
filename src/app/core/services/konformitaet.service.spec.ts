import { TestBed } from '@angular/core/testing';
import { KonformitaetService, InstanzModell } from './konformitaet.service';
import { ProfileDoc } from '../../models/profile.model';

/**
 * Der Abgleich ist zustandslos: alle Tests reichen ihm zwei Dokumente und —
 * wo Blatt-Wissen noetig ist — eine Tabelle statt eines Baums (Spec #31).
 */
describe('KonformitaetService', () => {
  let svc: KonformitaetService;

  const M = 'nachricht.test.0001';
  const V = { pflicht: 'w1', optional: 'w2', excl: 'w3' };

  const vorgabe = (teile: Partial<ProfileDoc> = {}): ProfileDoc => ({
    meta: {},
    statuses: [
      { id: V.pflicht, name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' },
      { id: V.optional, name: 'anzugeben, wenn vorhanden', farbe: '#0a0', wirkung: 'optional' },
      { id: V.excl, name: 'nicht verwendet', farbe: '#888', wirkung: 'ausgeschlossen' },
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

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(KonformitaetService);
  });

  it('meldet nichts, wenn die Nachricht der Fassung folgt', () => {
    const doc = vorgabe({
      elemente: {
        [`${M}/kopf`]: { status: V.pflicht },
        [`${M}/art`]: { werte: ['001', '002'] },
      },
    });
    const inst = instanz({
      elemente: { [`${M}/kopf`]: { beispiel: 'Az 1' }, [`${M}/art`]: { beispiel: '002' } },
    });

    expect(svc.pruefe(doc, inst, { istBlatt: () => true })).toEqual([]);
  });

  it('meldet einen belegten ausgeschlossenen Pfad — auch geerbt', () => {
    const doc = vorgabe({ elemente: { [`${M}/beteiligung`]: { status: V.excl } } });
    const inst = instanz({
      elemente: {
        [`${M}/beteiligung`]: { beispiel: 'x' },
        [`${M}/beteiligung@a1/name`]: { beispiel: 'Musterfrau' },
      },
    });

    const arten = svc.pruefe(doc, inst).map((v) => v.art);
    expect(arten).toEqual(['ausgeschlossen', 'ausgeschlossen']);
    // Die geerbte Meldung nennt die Quelle des Ausschlusses.
    const geerbt = svc.pruefe(doc, inst).find((v) => v.pfad.includes('@a1'))!;
    expect(geerbt.text).toContain(`${M}/beteiligung`);
  });

  it('meldet einen Wert ausserhalb der freigegebenen Auswahl', () => {
    const doc = vorgabe({ elemente: { [`${M}/art`]: { werte: ['001', '002'] } } });
    const inst = instanz({ elemente: { [`${M}/art`]: { beispiel: '007' } } });

    const v = svc.pruefe(doc, inst);
    expect(v.length).toBe(1);
    expect(v[0]!.art).toBe('wert');
    expect(v[0]!.text).toContain('007');
  });

  it('meldet eine verletzte Kardinalitaet in beide Richtungen', () => {
    const doc = vorgabe({
      elemente: { [`${M}/anlage`]: { min: '2' }, [`${M}/beteiligung`]: { max: '1' } },
    });
    const inst = instanz({
      auspraegungen: {
        [`${M}/beteiligung`]: [
          { id: 'a1', name: 'Notar/in' },
          { id: 'a2', name: 'Zeuge/Zeugin' },
        ],
      },
    });

    const v = svc.pruefe(doc, inst);
    expect(v.map((x) => x.art)).toEqual(['kardinalitaet', 'kardinalitaet']);
    expect(v.find((x) => x.pfad.endsWith('anlage'))!.text).toContain('mindestens 2');
    expect(v.find((x) => x.pfad.endsWith('beteiligung'))!.text).toContain('höchstens 1');
  });

  it('zaehlt eine generische Grenze je Vorkommen — am @-Pfad, wo materialisiert wird', () => {
    // Die Divergenz vor der gemeinsamen VorgabeSicht: der Abgleich zaehlte am
    // generischen Pfad, die Materialisierung legt die Vorkommen aber an den
    // @-Pfaden an (#28) — eine konforme Nachricht wurde als Entwurf gemeldet.
    const doc = vorgabe({
      elemente: { [`${M}/beteiligung/kontakt`]: { min: '2' } },
      auspraegungen: { [`${M}/beteiligung`]: [{ id: 'n1', name: 'Notar/in' }] },
    });
    const konform = instanz({
      auspraegungen: {
        [`${M}/beteiligung@n1/kontakt`]: [
          { id: 'v1', name: 'Vorkommen 1' },
          { id: 'v2', name: 'Vorkommen 2' },
        ],
      },
    });
    expect(svc.pruefe(doc, konform)).toEqual([]);

    // Nur ein Vorkommen: der Verstoss zeigt auf den @-Pfad, den der Baum rendert.
    const zuWenig = instanz({
      auspraegungen: { [`${M}/beteiligung@n1/kontakt`]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });
    const v = svc.pruefe(doc, zuWenig);
    expect(v.length).toBe(1);
    expect(v[0]!.art).toBe('kardinalitaet');
    expect(v[0]!.pfad).toBe(`${M}/beteiligung@n1/kontakt`);
  });

  it('Selbst-Ausschluss am generischen Zwilling meldet die Selbst-Variante (Deep-Review)', () => {
    // Der Ausschluss steht am generischen Pfad, der Wert im Vorkommen — das
    // ist derselbe Sachverhalt am selben Element, kein Vorfahren-Ausschluss.
    // Die "samt Teilbaum"-Variante nannte einen Pfad, den der Baum nicht
    // rendert (#28).
    const doc = vorgabe({ elemente: { [`${M}/bet/name`]: { status: V.excl } } });
    const inst = instanz({ elemente: { [`${M}/bet@a1/name`]: { beispiel: 'x' } } });

    const v = svc.pruefe(doc, inst);
    expect(v.length).toBe(1);
    expect(v[0]!.text).toContain('schließt das Element aus');
    expect(v[0]!.text).not.toContain('samt Teilbaum');
  });

  it('pfadgenaue Grenze gewinnt ueber die generische — keine Doppelmeldung (Deep-Review)', () => {
    // Generisch min 2, am Vorkommen n1 pfadgenau min 1: die Lesart weist den
    // pfadgenauen Eintrag als massgeblich aus — je Eintrag einzeln geprueft
    // wurde die generische Grenze trotzdem auf n1 projiziert und doppelt
    // gemeldet.
    const doc = vorgabe({
      elemente: {
        [`${M}/bet/kontakt`]: { min: '2' },
        [`${M}/bet@n1/kontakt`]: { min: '1' },
      },
      auspraegungen: { [`${M}/bet`]: [{ id: 'n1', name: 'Notar/in' }] },
    });
    const inst = instanz({
      auspraegungen: { [`${M}/bet@n1/kontakt`]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });

    expect(svc.pruefe(doc, inst)).toEqual([]); // min 1 erfuellt, min 2 gilt hier nicht
  });

  it('in ausgeschlossenen Vorkommen wird nicht gezaehlt (Deep-Review)', () => {
    // Vorkommen n2 ist ausgeschlossen: der Durchlauf materialisiert dort
    // nichts — die generische Mindestanzahl darf dort keinen Verstoss melden.
    const doc = vorgabe({
      elemente: {
        [`${M}/bet/kontakt`]: { min: '2' },
        [`${M}/bet@n2`]: { status: V.excl },
      },
      auspraegungen: {
        [`${M}/bet`]: [
          { id: 'n1', name: 'Notar/in' },
          { id: 'n2', name: 'Zeuge/Zeugin' },
        ],
      },
    });
    const inst = instanz({
      auspraegungen: {
        [`${M}/bet@n1/kontakt`]: [
          { id: 'v1', name: '1' },
          { id: 'v2', name: '2' },
        ],
      },
    });

    expect(svc.pruefe(doc, inst)).toEqual([]);
  });

  it('Vorkommen-Pflicht wird nicht vom Traeger geerbt — wie die Sperre (Deep-Review)', () => {
    // m/bet ist generisch zwingend; die Vorkommen selbst tragen keine eigene
    // Festlegung. Der Durchlauf erlaubt ihr Entfernen ausdruecklich
    // (auspSperreEntfernen, pfadgenau) — der Abgleich darf es nicht als
    // Verstoss melden.
    const doc = vorgabe({
      elemente: { [`${M}/bet`]: { status: V.pflicht } },
      auspraegungen: {
        [`${M}/bet`]: [
          { id: 'n1', name: 'Notar/in' },
          { id: 'n2', name: 'Zeuge/Zeugin' },
        ],
      },
    });
    const inst = instanz({
      auspraegungen: { [`${M}/bet`]: [{ id: 'n1', name: 'Notar/in' }] }, // n2 entfernt
    });

    expect(svc.pruefe(doc, inst).filter((v) => v.art === 'vorkommen')).toEqual([]);
  });

  it('meldet ein fehlendes zwingendes Vorkommen — die Kopie erfuellt es', () => {
    const doc = vorgabe({
      elemente: { [`${M}/beteiligung@n1`]: { status: V.pflicht } },
      auspraegungen: {
        [`${M}/beteiligung`]: [
          { id: 'n1', name: 'Notar/in' },
          { id: 'n2', name: 'Zeuge/Zeugin' },
        ],
      },
    });

    // Eigene Liste ohne das zwingende Vorkommen.
    const ohne = instanz({
      auspraegungen: { [`${M}/beteiligung`]: [{ id: 'n2', name: 'Zeuge' }] },
    });
    const v = svc.pruefe(doc, ohne);
    expect(v.length).toBe(1);
    expect(v[0]!.art).toBe('vorkommen');
    expect(v[0]!.text).toContain('Notar/in');

    // Eine Kopie traegt die Herkunft und zaehlt mit (#28).
    const mitKopie = instanz({
      auspraegungen: {
        [`${M}/beteiligung`]: [{ id: 'k9', name: 'Notar/in (Kopie)', vonId: 'n1' }],
      },
    });
    expect(svc.pruefe(doc, mitKopie)).toEqual([]);
  });

  it('meldet ein zwingend gesetztes Blatt ohne Wert, je Vorkommen', () => {
    const doc = vorgabe({
      elemente: { [`${M}/beteiligung/name`]: { status: V.pflicht } },
      auspraegungen: { [`${M}/beteiligung`]: [{ id: 'n1', name: 'Notar/in' }] },
    });
    const inst = instanz({
      auspraegungen: {
        [`${M}/beteiligung`]: [
          { id: 'n1', name: 'Notar/in' },
          { id: 'n2', name: 'Zeuge/Zeugin' },
        ],
      },
      elemente: { [`${M}/beteiligung@n1/name`]: { beispiel: 'Musterfrau' } },
    });

    const v = svc.pruefe(doc, inst, { istBlatt: (p) => p.endsWith('/name') });
    expect(v.length).toBe(1);
    expect(v[0]!.art).toBe('pflichtwert');
    expect(v[0]!.pfad).toBe(`${M}/beteiligung@n2/name`);
  });

  it('prueft Pflichtwerte nur mit Blatt-Wissen — ein Container bleibt unbeanstandet', () => {
    const doc = vorgabe({ elemente: { [`${M}/beteiligung`]: { status: V.pflicht } } });

    expect(svc.pruefe(doc, instanz())).toEqual([]); // ohne istBlatt gar nicht
    expect(svc.pruefe(doc, instanz(), { istBlatt: () => false })).toEqual([]);
  });
});
