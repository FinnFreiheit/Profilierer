import { TestBed } from '@angular/core/testing';
import { ValidationMarkerService } from './validation-marker.service';
import { StateService } from './state.service';

const M = 'nachricht.test.0001';

describe('ValidationMarkerService', () => {
  let svc: ValidationMarkerService;
  let state: StateService;

  /** Karte wie aus buildBeispielXmlMitPfaden: Zeile 4 Root, 5 Blatt, 7 Auspraegung. */
  const karte = new Map<number, string>([
    [4, M],
    [5, `${M}/kopf`],
    [7, `${M}/verfahren@a1/az`],
    [9, M],
  ]);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ValidationMarkerService);
    state = TestBed.inject(StateService);
  });

  it('loest exakte Zeilentreffer auf und setzt die Marker-Signals', () => {
    const eintraege = svc.markiere([{ text: 'Zeile 5: kaputt', zeile: 5 }], karte);
    expect(eintraege).toEqual([{ text: 'Zeile 5: kaputt', pfad: `${M}/kopf` }]);
    expect(state.valFehler()?.get(`${M}/kopf`)).toEqual(['Zeile 5: kaputt']);
  });

  it('faellt bei ungemappten Zeilen auf die naechstliegende vorherige zurueck', () => {
    // Zeile 6 ist z. B. eine Kommentarzeile — der Fehler landet am Blatt davor.
    const eintraege = svc.markiere([{ text: 'x', zeile: 6 }], karte);
    expect(eintraege[0]!.pfad).toBe(`${M}/kopf`);
  });

  it('Fehler ohne Zeile oder vor der ersten gemappten Zeile bleiben ohne Pfad', () => {
    const eintraege = svc.markiere(
      [
        { text: 'ohne Fundstelle' },
        { text: 'Zeile 1: Deklaration', zeile: 1 },
      ],
      karte,
    );
    expect(eintraege[0]!.pfad).toBeUndefined();
    expect(eintraege[1]!.pfad).toBeUndefined();
    // Nichts aufloesbar: die Signals bleiben geleert.
    expect(state.valFehler()).toBeNull();
    expect(state.valAnc()).toBeNull();
  });

  it('aggregiert Fehler auf alle Vorfahren — inklusive Elternelement der Auspraegung', () => {
    svc.markiere([{ text: 'a', zeile: 7 }], karte);
    const anc = state.valAnc()!;
    expect(anc.get(M)).toBe(1); // vor '/verfahren'
    expect(anc.get(`${M}/verfahren`)).toBe(1); // vor '@a1'
    expect(anc.get(`${M}/verfahren@a1`)).toBe(1); // vor '/az'
    expect(anc.get(`${M}/verfahren@a1/az`)).toBeUndefined(); // eigener Knoten zaehlt nicht als Vorfahr
  });

  it('sammelt mehrere Fehler am selben Pfad und zaehlt sie im Aggregat', () => {
    svc.markiere(
      [
        { text: 'a', zeile: 5 },
        { text: 'b', zeile: 5 },
      ],
      karte,
    );
    expect(state.valFehler()?.get(`${M}/kopf`)).toEqual(['a', 'b']);
    expect(state.valAnc()?.get(M)).toBe(2);
  });

  it('loesche() nullt beide Signals', () => {
    svc.markiere([{ text: 'a', zeile: 5 }], karte);
    svc.loesche();
    expect(state.valFehler()).toBeNull();
    expect(state.valAnc()).toBeNull();
  });

  describe('Schema-Erweiterungen', () => {
    /** Karte mit einem Erweiterungs-Blatt auf Zeile 6. */
    const karteErw = new Map<number, string>([
      [4, M],
      [5, `${M}/kopf`],
      [6, `${M}/~x1`],
      [9, M],
    ]);

    it('klassifiziert Fehler auf /~-Pfaden als bekannte Erweiterung — ohne Baum-Marker', () => {
      const eintraege = svc.markiere([{ text: 'not expected', zeile: 6 }], karteErw);
      expect(eintraege[0]!.erweiterung).toBeTrue();
      expect(eintraege[0]!.pfad).toBe(`${M}/~x1`);
      expect(state.valFehler()).toBeNull();
      expect(state.valAnc()).toBeNull();
    });

    it('gemischte Fehler: nur echte landen in den Marker-Signals', () => {
      const eintraege = svc.markiere(
        [
          { text: 'erw', zeile: 6 },
          { text: 'echt', zeile: 5 },
        ],
        karteErw,
      );
      expect(svc.nurErweiterungsFehler(eintraege)).toBeFalse();
      expect(state.valFehler()?.has(`${M}/kopf`)).toBeTrue();
      expect(state.valFehler()?.has(`${M}/~x1`)).toBeFalse();
      expect(state.valAnc()?.get(M)).toBe(1);
    });

    it('Namens-Fallback: Fehlertext mit bekanntem Erweiterungs-Namen zaehlt als bekannt', () => {
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' });
      // libxml2 meldet den Fehler hier am Folge-Element (Zeile 5, Schema-Pfad).
      const eintraege = svc.ordneZu(
        [{ text: "Element '{urn:test}zusatzAngabe': This element is not expected.", zeile: 5 }],
        karteErw,
      );
      expect(eintraege[0]!.erweiterung).toBeTrue();
    });

    it('Namens-Fallback greift nicht fuer fremde Elementnamen', () => {
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1' });
      const eintraege = svc.ordneZu([{ text: "Element 'kopf': fehlt", zeile: 5 }], karteErw);
      expect(eintraege[0]!.erweiterung).toBeUndefined();
    });

    it('nurErweiterungsFehler: true nur bei ausschliesslich bekannten Fehlern', () => {
      expect(svc.nurErweiterungsFehler([])).toBeFalse();
      expect(svc.nurErweiterungsFehler([{ text: 'a', erweiterung: true }])).toBeTrue();
      expect(
        svc.nurErweiterungsFehler([{ text: 'a', erweiterung: true }, { text: 'b' }]),
      ).toBeFalse();
    });
  });
});
