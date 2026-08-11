import { VorgabeSicht, InstanzModell } from './vorgabe-sicht';
import { ProfileDoc } from '../models/profile.model';

/**
 * Die Lesart der eingefrorenen Profilkopie — pur getestet, ohne TestBed. Das
 * Interface ist die Testflaeche: dieselben Faelle gelten fuer beide Adapter
 * (StateService und KonformitaetService), die vor diesem Modul je eine eigene
 * Implementierung hielten.
 */
describe('VorgabeSicht', () => {
  const M = 'nachricht.test.0001';
  const V = { pflicht: 'w1', optional: 'w2', excl: 'w3' };

  const doc = (teile: Partial<ProfileDoc> = {}): ProfileDoc => ({
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

  describe('quellPfad (vonId, #28)', () => {
    it('schreibt die Laufzeit-id einer Kopie segmentweise auf die Quelle zurueck', () => {
      const s = new VorgabeSicht(
        doc(),
        instanz({
          auspraegungen: {
            [`${M}/bet`]: [
              { id: 'n1', name: 'Notar/in' },
              { id: 'k9', name: 'Notar/in (Kopie)', vonId: 'n1' },
            ],
          },
        }),
      );
      expect(s.quellPfad(`${M}/bet@k9/name`)).toBe(`${M}/bet@n1/name`);
      // Ohne Herkunft bleibt die id stehen; ohne '@' passiert nichts.
      expect(s.quellPfad(`${M}/bet@n1/name`)).toBe(`${M}/bet@n1/name`);
      expect(s.quellPfad(`${M}/kopf`)).toBe(`${M}/kopf`);
    });

    it('loest verschachtelte Vorkommen auf: Vorfahren im eigenen, Ziel im Vorgabe-Pfadraum', () => {
      const s = new VorgabeSicht(
        doc(),
        instanz({
          auspraegungen: {
            [`${M}/bet`]: [{ id: 'k1', name: 'Kopie', vonId: 'n1' }],
            // Die innere Liste haengt am EIGENEN Pfadraum (k1), nicht am Ziel.
            [`${M}/bet@k1/anschrift`]: [{ id: 'k2', name: 'Kopie', vonId: 'b1' }],
          },
        }),
      );
      expect(s.quellPfad(`${M}/bet@k1/anschrift@k2/ort`)).toBe(`${M}/bet@n1/anschrift@b1/ort`);
    });
  });

  describe('eintrag / eintragGeerbt', () => {
    it('pfadgenau vor Quellpfad vor generisch', () => {
      const s = new VorgabeSicht(
        doc({
          elemente: {
            [`${M}/bet/name`]: { anmerkung: 'generisch' },
            [`${M}/bet@n1/name`]: { anmerkung: 'quelle' },
          },
        }),
        instanz({
          auspraegungen: { [`${M}/bet`]: [{ id: 'k9', name: 'Kopie', vonId: 'n1' }] },
        }),
      );
      // Kopie erbt die Unter-Profilierung ihrer Quelle …
      expect(s.eintrag(`${M}/bet@k9/name`)?.anmerkung).toBe('quelle');
      // … ein fremdes Vorkommen faellt auf den generischen Pfad zurueck.
      expect(s.eintrag(`${M}/bet@x7/name`)).toBeNull();
      expect(s.eintragGeerbt(`${M}/bet@x7/name`)?.anmerkung).toBe('generisch');
    });
  });

  describe('wirkung / wirkungGeerbt', () => {
    it('loest ueber die Stufenliste der Vorgabe auf', () => {
      const s = new VorgabeSicht(doc({ elemente: { [`${M}/az`]: { status: V.excl } } }), instanz());
      expect(s.wirkung(`${M}/az`)).toBe('ausgeschlossen');
      expect(s.wirkung(`${M}/kopf`)).toBeNull();
    });

    it('erbt feldweise: ein Eintrag ohne Status verdeckt die generische Wirkung nicht', () => {
      // Genau die Divergenz, die der Abgleich vor diesem Modul hatte: er las
      // eintragsweise und haette hier null geliefert, waehrend die Sperre des
      // Stores die generische Wirkung sah.
      const s = new VorgabeSicht(
        doc({
          elemente: {
            [`${M}/bet/name`]: { status: V.pflicht },
            [`${M}/bet@n1/name`]: { beispiel: 'Musterfrau' }, // pfadgenau, aber ohne Status
          },
        }),
        instanz(),
      );
      expect(s.wirkungGeerbt(`${M}/bet@n1/name`)).toBe('pflicht');
      // Der Eintrag selbst bleibt eintragsweise pfadgenau (Beispielwert der Quelle).
      expect(s.eintragGeerbt(`${M}/bet@n1/name`)?.beispiel).toBe('Musterfrau');
    });
  });

  describe('auspsEffektiv / alleListen', () => {
    it('kein Mischen: eine eigene Liste ist komplett massgeblich', () => {
      const s = new VorgabeSicht(
        doc({ auspraegungen: { [`${M}/bet`]: [{ id: 'n1', name: 'Notar/in' }] } }),
        instanz({ auspraegungen: { [`${M}/bet`]: [{ id: 'e1', name: 'Eigenes' }] } }),
      );
      expect(s.auspsEffektiv(`${M}/bet`)?.map((a) => a.id)).toEqual(['e1']);
    });

    it('faellt ohne eigene Liste auf die Vorgabe zurueck; alleListen ergaenzt Vorgabe-Pfade', () => {
      const s = new VorgabeSicht(
        doc({ auspraegungen: { [`${M}/bet`]: [{ id: 'n1', name: 'Notar/in' }] } }),
        instanz({ auspraegungen: { [`${M}/anlage`]: [{ id: 'a1', name: 'Anlage 1' }] } }),
      );
      expect(s.auspsEffektiv(`${M}/bet`)?.map((a) => a.id)).toEqual(['n1']);
      expect(
        s
          .alleListen()
          .map(([p]) => p)
          .sort(),
      ).toEqual([`${M}/anlage`, `${M}/bet`]);
    });
  });

  describe('ausschlussQuelle', () => {
    it('nennt den naechstgelegenen Ausschluss, ueber Vorkommen-Grenzen hinweg', () => {
      const s = new VorgabeSicht(
        doc({ elemente: { [`${M}/bet`]: { status: V.excl } } }),
        instanz(),
      );
      expect(s.ausschlussQuelle(`${M}/bet@a1/name`)).toBe(`${M}/bet`);
      expect(s.ausschlussQuelle(`${M}/kopf`)).toBeNull();
    });
  });

  describe('vorkommenAnzahl (ADR 0015)', () => {
    it('benannte Vorkommen zaehlen; sonst eins; weggelassen null', () => {
      const s = new VorgabeSicht(
        doc(),
        instanz({
          auspraegungen: {
            [`${M}/bet`]: [
              { id: 'a1', name: '1' },
              { id: 'a2', name: '2' },
            ],
          },
          elemente: { [`${M}/az`]: { status: V.excl } },
        }),
      );
      expect(s.vorkommenAnzahl(`${M}/bet`)).toBe(2);
      expect(s.vorkommenAnzahl(`${M}/kopf`)).toBe(1);
      expect(s.vorkommenAnzahl(`${M}/az`)).toBe(0);
    });

    it('die Umgebungs-Auskunft schlaegt den Rueckfall — sie kennt das Schema', () => {
      // Der Rueckfall zaehlt „kein Eintrag" als ein Vorkommen; ob der Export
      // das Element wirklich schreibt, weiss nur die eine Regel
      // (`core/enthalten.ts`), und die braucht das Schema.
      const s = new VorgabeSicht(doc(), instanz());
      expect(s.vorkommenAnzahl(`${M}/az`)).toBe(1);
      expect(s.vorkommenAnzahl(`${M}/az`, () => false)).toBe(0);
      expect(s.vorkommenAnzahl(`${M}/az`, () => true)).toBe(1);
    });

    it('„keine Auskunft" (null) faellt auf die Zaehlkonvention zurueck', () => {
      // Was der Baum nicht kennt — etwa ein Pfad aus einer alten Fassung —
      // soll keinen Verstoss erfinden.
      const s = new VorgabeSicht(doc(), instanz());
      expect(s.vorkommenAnzahl(`${M}/az`, () => null)).toBe(1);
    });

    it('benannte Vorkommen gehen der Auskunft vor', () => {
      const s = new VorgabeSicht(
        doc(),
        instanz({ auspraegungen: { [`${M}/bet`]: [{ id: 'a1', name: '1' }] } }),
      );
      expect(s.vorkommenAnzahl(`${M}/bet`, () => false)).toBe(1);
    });
  });

  describe('imPfadraum', () => {
    it('uebergeht Festlegungen im id-Raum der Vorgabe, die die Nachricht nicht tragen kann', () => {
      // Am echten Bestand gefunden: die Profilierung setzt ihre Festlegungen
      // direkt an Vorkommen-Pfaden (`…/dok@n1/id`). Eine aus XML gewonnene
      // Nachricht liegt in einem anderen id-Raum — ohne diesen Filter wurden
      // 97 solche Festlegungen als „fehlt" gemeldet, und der Sprung im Bericht
      // landete auf der Wurzel.
      const s = new VorgabeSicht(
        doc({ auspraegungen: { [`${M}/dok`]: [{ id: 'n1', name: 'Antrag' }] } }),
        instanz(),
      );
      // Ohne Auskunft (gefuehrter Durchlauf) traegt jeder Pfad.
      expect(s.imPfadraum(`${M}/dok@n1/id`)).toBeTrue();
      // Unzuordenbar: der Pfad ist unbeantwortbar, nicht „nicht enthalten".
      expect(s.imPfadraum(`${M}/dok@n1/id`, () => false)).toBeFalse();
      // Pfade ohne Vorkommen sind nie betroffen.
      expect(s.imPfadraum(`${M}/kopf`, () => false)).toBeTrue();
    });

    it('eigene Vorkommen tragen — per id und ueber die Herkunft einer Kopie', () => {
      const s = new VorgabeSicht(
        doc({ auspraegungen: { [`${M}/dok`]: [{ id: 'n1', name: 'Antrag' }] } }),
        instanz({
          auspraegungen: { [`${M}/dok`]: [{ id: 'v1', name: 'Antrag', vonId: 'n1' }] },
        }),
      );
      expect(s.imPfadraum(`${M}/dok@v1/id`, () => false)).toBeTrue(); // eigene id
      expect(s.imPfadraum(`${M}/dok@n1/id`, () => false)).toBeTrue(); // ueber vonId
      expect(s.imPfadraum(`${M}/dok@fremd/id`, () => false)).toBeFalse();
    });
  });

  describe('instanzPfade', () => {
    it('loest einen generischen Festlegungs-Pfad je Vorkommen des Elternelements auf', () => {
      const s = new VorgabeSicht(
        doc({ auspraegungen: { [`${M}/bet`]: [{ id: 'n1', name: 'Notar/in' }] } }),
        instanz({
          auspraegungen: {
            [`${M}/anlage`]: [
              { id: 'a1', name: '1' },
              { id: 'a2', name: '2' },
            ],
          },
        }),
      );
      // Eigene Vorkommen des Durchlaufs …
      expect(s.instanzPfade(`${M}/anlage/name`)).toEqual([
        `${M}/anlage@a1/name`,
        `${M}/anlage@a2/name`,
      ]);
      // … und die der Vorgabe, solange der Durchlauf sie nicht angefasst hat.
      expect(s.instanzPfade(`${M}/bet/name`)).toEqual([`${M}/bet@n1/name`]);
      // Ohne Vorkommen bleibt der Pfad, wie er ist.
      expect(s.instanzPfade(`${M}/kopf`)).toEqual([`${M}/kopf`]);
    });

    it('faechert nicht ueber unzuordenbare Vorgabe-Vorkommen auf', () => {
      // Am echten Bestand gefunden: die Vorgabe fuehrt benannte Vorkommen, die
      // hochgeladene Nachricht traegt dort nur **eines** und darum keine eigene
      // Liste — `auspsEffektiv` fiel auf die Vorgabe zurueck und der Abgleich
      // fragte nach `…/dokument@<vorgabeId>/id`. Pfade, die die Nachricht nie
      // tragen kann: 97 Verstoesse „fehlt", und der Sprung im Bericht landete
      // auf der Wurzel, weil der Baum sie nicht kennt.
      const s = new VorgabeSicht(
        doc({ auspraegungen: { [`${M}/dok`]: [{ id: 'n1', name: 'Antrag' }] } }),
        instanz(),
      );
      // Ohne Auskunft (gefuehrter Durchlauf): das Erbe gilt, es wird aufgefaechert.
      expect(s.instanzPfade(`${M}/dok/id`)).toEqual([`${M}/dok@n1/id`]);
      // Unzuordenbar (hochgeladene Nachricht): der generische Pfad, dort liegen
      // ihre Werte.
      expect(s.instanzPfade(`${M}/dok/id`, () => false)).toEqual([`${M}/dok/id`]);
    });

    it('faechert ueber **eigene** Vorkommen immer auf — auch als unzuordenbar gemeldet', () => {
      // Fuehrt die Nachricht selbst eine Liste, ist sie ihr Pfadraum; ob sich
      // ihre Vorkommen den benannten der Vorgabe zuordnen lassen, aendert daran
      // nichts.
      const s = new VorgabeSicht(
        doc({ auspraegungen: { [`${M}/dok`]: [{ id: 'n1', name: 'Antrag' }] } }),
        instanz({ auspraegungen: { [`${M}/dok`]: [{ id: 'v1', name: 'Vorkommen 1' }] } }),
      );
      expect(s.instanzPfade(`${M}/dok/id`, () => false)).toEqual([`${M}/dok@v1/id`]);
    });

    it('faechert jede Vorfahren-Liste auf — keine Phantompfade bei Schachtelung', () => {
      // Deep-Review-Befund: frueher wurde nur die letzte Listen-Ebene
      // expandiert; fuer m/bet/adr/ort entstand m/bet/adr@x/ort — ein Pfad,
      // den niemand rendert. Die Vorkommen liegen real unter m/bet@a1/adr@x.
      const s = new VorgabeSicht(
        doc(),
        instanz({
          auspraegungen: {
            [`${M}/bet`]: [{ id: 'a1', name: 'Notar/in' }],
            [`${M}/bet@a1/adr`]: [
              { id: 'x1', name: 'Meldeadresse' },
              { id: 'x2', name: 'Kanzlei' },
            ],
          },
        }),
      );
      expect(s.instanzPfade(`${M}/bet/adr/ort`)).toEqual([
        `${M}/bet@a1/adr@x1/ort`,
        `${M}/bet@a1/adr@x2/ort`,
      ]);
    });
  });
});
