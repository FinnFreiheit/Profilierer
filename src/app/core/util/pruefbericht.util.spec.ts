import { Pruefbericht, PruefberichtKopf } from '../../models/pruefbericht.model';
import { berichtEintraege, berichtKopfzeile, berichtTitel } from './pruefbericht.util';

/**
 * Die Aufbereitung des Pruefberichts — vor allem die **Zurechnung**: was der
 * Nachricht angelastet wird und was der eigenen Profilierung.
 */
describe('Pruefbericht-Aufbereitung', () => {
  const kopf = (teile: Partial<PruefberichtKopf> = {}): PruefberichtKopf => ({
    name: 'lieferung.xml',
    msgName: 'nachricht.test.0001',
    profilName: 'Testprofil',
    fassung: 'v3',
    xjustizVersion: '3.6.2',
    schema: 'valide',
    schemaFehler: [],
    festlegungen: 236,
    vorkommenUnzuordenbar: false,
    ...teile,
  });

  const bericht = (teile: Partial<Pruefbericht> = {}): Pruefbericht => ({
    kopf: kopf(),
    verstoesse: [],
    luecken: [],
    ...teile,
  });

  describe('berichtTitel', () => {
    it('nennt Luecken mit — „profilkonform" ueber 132 Luecken waere falsch-gruen', () => {
      // Ohne Festlegung gibt es nichts einzuhalten: null Verstoesse sagen dann
      // nichts ueber die Nachricht, sondern etwas ueber die Profilierung.
      const b = bericht({
        luecken: Array.from({ length: 132 }, (_, i) => ({
          pfad: 'm/f' + i,
          wert: 'x',
          text: 't',
        })),
      });
      expect(berichtTitel('a.xml', b)).toBe(
        'Prüfbericht „a.xml" — keine Abweichungen, aber 132 Lücken der Profilierung',
      );
    });

    it('„profilkonform" nur, wenn beides leer ist', () => {
      expect(berichtTitel('a.xml', bericht())).toBe('Prüfbericht „a.xml" — profilkonform');
    });

    it('zaehlt Abweichungen, mit Luecken als Zusatz', () => {
      const einer = [{ pfad: 'm/a', art: 'wert' as const, text: 't' }];
      expect(berichtTitel('a.xml', bericht({ verstoesse: einer }))).toBe(
        'Prüfbericht „a.xml" — 1 Abweichung von der Profilierung',
      );
      expect(
        berichtTitel(
          'a.xml',
          bericht({ verstoesse: einer, luecken: [{ pfad: 'm/b', wert: 'x', text: 't' }] }),
        ),
      ).toBe('Prüfbericht „a.xml" — 1 Abweichung von der Profilierung, 1 Lücken');
    });
  });

  describe('berichtKopfzeile', () => {
    it('nennt Profilierung, Fassung und Version', () => {
      const z = berichtKopfzeile(kopf({ fortschritt: { x: 412, y: 468 } }));
      expect(z).toContain('„Testprofil"');
      expect(z).toContain('Fassung v3');
      expect(z).toContain('XJustiz 3.6.2');
      expect(z).toContain('412 von 468');
    });

    it('warnt bei fehlender Schemavaliditaet — der Bericht kann sonst falsch-gruen sein', () => {
      expect(berichtKopfzeile(kopf({ schema: 'invalide' }))).toContain('ungeprüft');
      expect(berichtKopfzeile(kopf({ schema: 'unpruefbar' }))).toContain('nicht prüfbar');
      expect(berichtKopfzeile(kopf())).not.toContain('ungeprüft');
    });

    it('faellt auf die zaehlbare Angabe zurueck, wo der Fortschritt fehlt', () => {
      // Eingefrorene Versionen fuehren `fortschritt` nicht mit — gerade dort
      // wird aber am ehesten geprueft. „unbekannt" waere die schlechteste
      // verfuegbare Auskunft.
      const z = berichtKopfzeile(kopf());
      expect(z).toContain('236 Festlegungen');
      expect(z).toContain('nicht mitgeführt');
    });

    it('nennt die Grenze bei nicht zuordenbaren Vorkommen', () => {
      const z = berichtKopfzeile(kopf({ vorkommenUnzuordenbar: true }));
      expect(z).toContain('Anzahl, nicht ihre Zuordnung');
    });
  });

  describe('berichtEintraege', () => {
    it('haelt Verstoesse und Luecken in getrennten Abschnitten', () => {
      const e = berichtEintraege(
        bericht({
          verstoesse: [{ pfad: 'm/az', art: 'wert', text: 'Wert nicht freigegeben' }],
          luecken: [{ pfad: 'm/art', wert: '007', text: 'keine Festlegung' }],
        }),
      );
      const abschnitte = e.filter((x) => x.abschnitt).map((x) => x.text);
      expect(abschnitte).toEqual([
        'Abweichungen von der Profilierung (1)',
        'Lücken der Profilierung (1)',
      ]);
      // Beide Befunde sind klickbar — der Sprung zum Element ist der Zweck.
      expect(e.filter((x) => x.pfad).map((x) => x.pfad)).toEqual(['m/az', 'm/art']);
    });

    it('sagt „keine" statt den Abschnitt wegzulassen — Schweigen waere keine Aussage', () => {
      const e = berichtEintraege(bericht());
      expect(e.filter((x) => x.abschnitt).length).toBe(2);
      expect(e.some((x) => x.text.startsWith('Keine — die Nachricht hält'))).toBeTrue();
      expect(e.some((x) => x.text.startsWith('Keine — zu jedem belegten'))).toBeTrue();
    });

    it('haengt die Schemafehler als eigenen Abschnitt an, wenn es welche gibt', () => {
      const ohne = berichtEintraege(bericht());
      expect(ohne.some((x) => x.text.startsWith('Schemafehler'))).toBeFalse();

      const mit = berichtEintraege(
        bericht({ kopf: kopf({ schema: 'invalide', schemaFehler: ['Zeile 3: kaputt'] }) }),
      );
      expect(
        mit.some((x) => x.abschnitt && x.text === 'Schemafehler der Nachricht (1)'),
      ).toBeTrue();
      expect(mit.some((x) => x.text === 'Zeile 3: kaputt')).toBeTrue();
    });
  });
});
