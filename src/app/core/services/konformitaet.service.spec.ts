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

  /**
   * Die Verstoesse eines Abgleichs. Fast alle Faelle hier handeln von der
   * Nachricht; die Luecken der Profilierung haben ihren eigenen Block.
   */
  const verstoesse = (
    ...args: Parameters<KonformitaetService['pruefe']>
  ): ReturnType<KonformitaetService['pruefe']>['verstoesse'] => svc.pruefe(...args).verstoesse;

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

    expect(verstoesse(doc, inst, { istBlatt: () => true })).toEqual([]);
  });

  it('meldet einen belegten ausgeschlossenen Pfad — auch geerbt', () => {
    const doc = vorgabe({ elemente: { [`${M}/beteiligung`]: { status: V.excl } } });
    const inst = instanz({
      elemente: {
        [`${M}/beteiligung`]: { beispiel: 'x' },
        [`${M}/beteiligung@a1/name`]: { beispiel: 'Musterfrau' },
      },
    });

    const arten = verstoesse(doc, inst).map((v) => v.art);
    expect(arten).toEqual(['ausgeschlossen', 'ausgeschlossen']);
    // Die geerbte Meldung nennt die Quelle des Ausschlusses.
    const geerbt = verstoesse(doc, inst).find((v) => v.pfad.includes('@a1'))!;
    expect(geerbt.text).toContain(`${M}/beteiligung`);
  });

  it('meldet einen Wert ausserhalb der freigegebenen Auswahl', () => {
    const doc = vorgabe({ elemente: { [`${M}/art`]: { werte: ['001', '002'] } } });
    const inst = instanz({ elemente: { [`${M}/art`]: { beispiel: '007' } } });

    const v = verstoesse(doc, inst);
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

    const v = verstoesse(doc, inst);
    expect(v.map((x) => x.art)).toEqual(['kardinalitaet', 'kardinalitaet']);
    expect(v.find((x) => x.pfad.endsWith('anlage'))!.text).toContain('mindestens 2');
    expect(v.find((x) => x.pfad.endsWith('beteiligung'))!.text).toContain('höchstens 1');
  });

  it('meldet eine Mindestanzahl, die durch Abwesenheit verletzt ist (mit Umgebungs-Auskunft)', () => {
    // Der Widerspruch, den die eine Regel aufloest: die Profilierung grenzt ein
    // im Schema optionales Element auf min = 1 ein, ohne Statusstufe. Der
    // Export schreibt es (Untergrenze der Profilierung); traegt die Nachricht
    // es dennoch nicht, ist das ein Verstoss. Ohne Auskunft zaehlte „kein
    // Eintrag" als ein Vorkommen und die Nachricht galt als konform.
    const doc = vorgabe({ elemente: { [`${M}/az`]: { min: '1' } } });
    const ohneAz = instanz();

    expect(verstoesse(doc, ohneAz)).toEqual([]); // Rueckfall: schwaechere Auskunft

    const v = verstoesse(doc, ohneAz, { istEnthalten: () => false });
    expect(v.map((x) => x.art)).toEqual(['kardinalitaet']);
    expect(v[0]!.text).toContain('mindestens 1');
    expect(v[0]!.text).toContain('die Nachricht trägt 0'); // nicht mehr „traegt 1"

    // Traegt sie es, bleibt es still.
    expect(verstoesse(doc, ohneAz, { istEnthalten: () => true })).toEqual([]);
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
    expect(verstoesse(doc, konform)).toEqual([]);

    // Nur ein Vorkommen: der Verstoss zeigt auf den @-Pfad, den der Baum rendert.
    const zuWenig = instanz({
      auspraegungen: { [`${M}/beteiligung@n1/kontakt`]: [{ id: 'v1', name: 'Vorkommen 1' }] },
    });
    const v = verstoesse(doc, zuWenig);
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

    const v = verstoesse(doc, inst);
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

    expect(verstoesse(doc, inst)).toEqual([]); // min 1 erfuellt, min 2 gilt hier nicht
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

    expect(verstoesse(doc, inst)).toEqual([]);
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

    expect(verstoesse(doc, inst).filter((v) => v.art === 'vorkommen')).toEqual([]);
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
    const v = verstoesse(doc, ohne);
    expect(v.length).toBe(1);
    expect(v[0]!.art).toBe('vorkommen');
    expect(v[0]!.text).toContain('Notar/in');

    // Eine Kopie traegt die Herkunft und zaehlt mit (#28).
    const mitKopie = instanz({
      auspraegungen: {
        [`${M}/beteiligung`]: [{ id: 'k9', name: 'Notar/in (Kopie)', vonId: 'n1' }],
      },
    });
    expect(verstoesse(doc, mitKopie)).toEqual([]);
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

    const v = verstoesse(doc, inst, { istBlatt: (p) => p.endsWith('/name') });
    expect(v.length).toBe(1);
    expect(v[0]!.art).toBe('pflichtwert');
    expect(v[0]!.pfad).toBe(`${M}/beteiligung@n2/name`);
  });

  it('verlangt nichts unter einem Vorfahren, den die Nachricht nicht enthaelt (ADR 0016)', () => {
    // Am laufenden System gefunden: die Profilierung setzte mehrere Zweige einer
    // **Auswahl** zwingend. In einer Auswahl kann nur einer vorkommen — die
    // uebrigen fehlen notwendig. Gemeldet wurden zwoelf Befunde, alle unschuldig.
    const doc = vorgabe({
      elemente: {
        [`${M}/auswahl_x/zweigA/feld`]: { status: V.pflicht },
        [`${M}/auswahl_x/zweigB/feld`]: { status: V.pflicht },
      },
    });
    // Die Nachricht traegt Zweig A, nicht B.
    const enthalten = new Set([
      M,
      `${M}/auswahl_x`,
      `${M}/auswahl_x/zweigA`,
      `${M}/auswahl_x/zweigA/feld`,
    ]);
    const v = verstoesse(
      doc,
      instanz({ elemente: { [`${M}/auswahl_x/zweigA/feld`]: { beispiel: 'x' } } }),
      {
        istEnthalten: (p) => enthalten.has(p),
        istBlatt: (p) => p.endsWith('/feld'),
      },
    );

    expect(v).toEqual([]);
  });

  it('meldet den fehlenden Vorfahren selbst, wenn die Profilierung ihn verlangt', () => {
    // Die Regel unterdrueckt den Inhalt, nicht den Befund: verlangt die
    // Profilierung den Ast selbst, steht er im Bericht — einmal, statt
    // dutzendfach fuer jedes Blatt darunter.
    const doc = vorgabe({
      elemente: {
        [`${M}/bet/adresse`]: { status: V.pflicht },
        [`${M}/bet/adresse/ort`]: { status: V.pflicht },
      },
    });
    const enthalten = new Set([M, `${M}/bet`]);
    const v = verstoesse(doc, instanz(), {
      istEnthalten: (p) => enthalten.has(p),
      istBlatt: (p) => p.endsWith('/ort'),
    });

    expect(v.map((x) => x.pfad)).toEqual([`${M}/bet/adresse`]);
    expect(v[0]!.art).toBe('fehlt');
  });

  it('eine synthetische Gruppe im Pfad unterdrueckt nichts („keine Auskunft")', () => {
    // Synthetische Knoten sind keine Elemente der Nachricht. Wuerden sie mit
    // „nein" antworten, verschwaenden alle Befunde unter jeder Gruppe.
    const doc = vorgabe({ elemente: { [`${M}/_gruppe/feld`]: { status: V.pflicht } } });
    const v = verstoesse(doc, instanz(), {
      istEnthalten: (p) => (p.includes('_gruppe') && !p.endsWith('/feld') ? null : p === M),
      istBlatt: () => true,
    });

    expect(v.map((x) => x.art)).toEqual(['fehlt']);
    expect(v[0]!.pfad).toBe(`${M}/_gruppe/feld`);
  });

  it('prueft Pflichtwerte nur mit Blatt-Wissen — ein Container bleibt unbeanstandet', () => {
    const doc = vorgabe({ elemente: { [`${M}/beteiligung`]: { status: V.pflicht } } });

    expect(verstoesse(doc, instanz())).toEqual([]); // ohne istBlatt gar nicht
    expect(verstoesse(doc, instanz(), { istBlatt: () => false })).toEqual([]);
  });

  // ── Luecken der Profilierung (kein Verstoss der Nachricht) ───────────

  describe('luecken', () => {
    const luecken = (doc: ProfileDoc, inst: InstanzModell) => svc.pruefe(doc, inst).luecken;

    it('meldet belegte Elemente ohne Festlegung — mit Wert und Pfad', () => {
      const doc = vorgabe({ elemente: { [`${M}/kopf`]: { status: V.pflicht } } });
      const inst = instanz({
        elemente: { [`${M}/kopf`]: { beispiel: 'Az 1' }, [`${M}/az`]: { beispiel: '4 O 12/25' } },
      });

      const l = luecken(doc, inst);
      expect(l.map((x) => x.pfad)).toEqual([`${M}/az`]);
      expect(l[0]!.wert).toBe('4 O 12/25');
      expect(l[0]!.text).toContain('keine Festlegung');
    });

    it('eine Festlegung am generischen Pfad deckt jedes Vorkommen (Erbe)', () => {
      const doc = vorgabe({ elemente: { [`${M}/bet/name`]: { status: V.optional } } });
      const inst = instanz({ elemente: { [`${M}/bet@a1/name`]: { beispiel: 'Musterfrau' } } });

      expect(luecken(doc, inst)).toEqual([]);
    });

    it('Anmerkung und Beispielwert sind keine Festlegung', () => {
      // Sie erlaeutern und schlagen vor — entschieden ist damit nichts.
      const doc = vorgabe({
        elemente: { [`${M}/az`]: { anmerkung: 'noch zu klären', beispiel: '4 O 1/25' } },
      });
      const inst = instanz({ elemente: { [`${M}/az`]: { beispiel: 'x' } } });

      expect(luecken(doc, inst).map((x) => x.pfad)).toEqual([`${M}/az`]);
    });

    it('eine durchgesetzte Grenze ohne Statusstufe ist eine Aussage — keine Luecke', () => {
      // Sonst meldete der Bericht dasselbe Element als Verstoss *und* als
      // Luecke: "die Profilierung sagt nichts" und "die Nachricht haelt sich
      // nicht daran" im selben Atemzug.
      const doc = vorgabe({ elemente: { [`${M}/art`]: { werte: ['001'] } } });
      const inst = instanz({ elemente: { [`${M}/art`]: { beispiel: '007' } } });

      expect(verstoesse(doc, inst).map((v) => v.art)).toEqual(['wert']);
      expect(luecken(doc, inst)).toEqual([]);

      // Ebenso eine Kardinalitaets-Eingrenzung.
      const mitGrenze = vorgabe({ elemente: { [`${M}/art`]: { max: '1' } } });
      expect(luecken(mitGrenze, inst)).toEqual([]);
    });

    it('Ausgeschlossenes ist ein Verstoss und keine Luecke — nicht doppelt melden', () => {
      const doc = vorgabe({ elemente: { [`${M}/bet`]: { status: V.excl } } });
      const inst = instanz({ elemente: { [`${M}/bet@a1/name`]: { beispiel: 'x' } } });

      expect(verstoesse(doc, inst).map((v) => v.art)).toEqual(['ausgeschlossen']);
      expect(luecken(doc, inst)).toEqual([]);
    });

    it('unbelegte Elemente sind keine Luecke — es geht um das, was die Nachricht sagt', () => {
      const doc = vorgabe();
      expect(luecken(doc, instanz({ elemente: { [`${M}/az`]: { beispiel: '  ' } } }))).toEqual([]);
    });
  });
});
