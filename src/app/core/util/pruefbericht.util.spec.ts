import { Pruefbericht, PruefberichtKopf } from '../../models/pruefbericht.model';
import { berichtEintraege, berichtKopfzeile, berichtTitel } from './pruefbericht.util';
import { ListenLage } from '../kennzeichen-lage';

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
    zeitpunkt: 0,
    festlegungen: 236,
    nErweiterung: 0,
    reichweite: { gesamt: 236, ungeprueft: 0 },
    vorkommenUnzuordenbar: false,
    ...teile,
  });

  const bericht = (teile: Partial<Pruefbericht> = {}): Pruefbericht => ({
    kopf: kopf(),
    verstoesse: [],
    luecken: [],
    zuordnung: [],
    kennzeichenLage: [],
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

    it('nennt die Reichweite — „keine Abweichungen" ohne sie ist eine Blankozusage', () => {
      const z = berichtKopfzeile(kopf({ reichweite: { gesamt: 236, ungeprueft: 216 } }));
      expect(z).toContain('216 von 236 Festlegungen ließen sich nicht zuordnen');
      expect(z).toContain('ungeprüft');
      // Wo alles angewandt wurde, entfällt die Zeile.
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

    it('nennt die Grenze bei nicht zuordenbaren Vorkommen — samt Handgriff (#121)', () => {
      const z = berichtKopfzeile(kopf({ vorkommenUnzuordenbar: true }));
      expect(z).toContain('zählt allein die Anzahl');
      // Seit #116 ist die Grenze keine Eigenschaft von XJustiz mehr, sondern
      // eine Folge fehlender Kennzeichen. Der Satz muss das sagen, sonst liest
      // er sich als unabaenderlich.
      expect(z).toContain('kennzeichnend');
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

    it('nachbeauftragte Elemente stehen im eigenen Abschnitt und zaehlen nicht mit', () => {
      // #98/Frage 8: ein nachbeauftragtes Element gibt es im Schema nicht — eine
      // gueltige XJustiz-Nachricht kann es nicht enthalten. Es dem Absender
      // anzulasten waere eine falsche Beschuldigung.
      const b = bericht({
        kopf: kopf({ nErweiterung: 1 }),
        verstoesse: [
          { pfad: 'm/az', art: 'fehlt', text: 'echter Befund' },
          { pfad: 'm/~x1/feld', art: 'fehlt', text: 'nachbeauftragt', erweiterung: true },
        ],
      });

      expect(berichtTitel('a.xml', b)).toContain('1 Abweichung von der Profilierung');
      expect(berichtTitel('a.xml', b)).not.toContain('2 Abweichungen');

      const e = berichtEintraege(b);
      expect(e.filter((x) => x.abschnitt).map((x) => x.text)).toEqual([
        'Abweichungen von der Profilierung (1)',
        'Lücken der Profilierung (0)',
        'Nachbeauftragte Elemente (1)',
      ]);
      // Der Eintrag traegt die Kennzeichnung, die der Dialog schon rendert.
      expect(e.find((x) => x.text === 'nachbeauftragt')?.erweiterung).toBeTrue();

      expect(berichtKopfzeile(b.kopf)).toContain('zählen nicht gegen die Nachricht');
    });

    it('ohne nachbeauftragte Elemente entfaellt der Abschnitt', () => {
      const e = berichtEintraege(bericht());
      expect(e.some((x) => x.text.startsWith('Nachbeauftragte'))).toBeFalse();
      expect(berichtKopfzeile(kopf())).not.toContain('nachbeauftragte');
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

    describe('Kennzeichen-Abschnitt (#121)', () => {
      const lage = (teile: Partial<ListenLage> = {}): ListenLage => ({
        listPfad: 'm/beteiligung',
        auspNamen: ['Notar', 'Antragsteller'],
        markiert: [],
        ohneTrennwirkung: [],
        kandidaten: [],
        ...teile,
      });

      it('entfaellt, wo nichts zu sagen ist', () => {
        expect(
          berichtEintraege(bericht()).some((x) => x.text.startsWith('Kennzeichen')),
        ).toBeFalse();
      });

      it('nennt den Kandidaten und was er bewirken wuerde — ohne zu markieren', () => {
        const e = berichtEintraege(
          bericht({
            kennzeichenLage: [
              lage({ kandidaten: [{ suffix: 'rolle', trennung: 'vollstaendig', offen: [] }] }),
            ],
          }),
        );
        const zeile = e.find((x) => x.text.includes('rolle'))!;
        expect(e.some((x) => x.abschnitt && x.text === 'Kennzeichen (1)')).toBeTrue();
        expect(zeile.text).toContain('Notar');
        expect(zeile.text).toContain('trennt alle Vorkommen');
        expect(zeile.pfad).toBe('m/beteiligung');
      });

      it('benennt eine teilweise Trennung mit den offen bleibenden Vorkommen', () => {
        const e = berichtEintraege(
          bericht({
            kennzeichenLage: [
              lage({
                kandidaten: [{ suffix: 'rolle', trennung: 'teilweise', offen: ['A', 'B'] }],
              }),
            ],
          }),
        );
        expect(e.some((x) => x.text.includes('A, B') && x.text.includes('teilweise'))).toBeTrue();
      });

      it('meldet ein gesetztes Kennzeichen ohne Trennwirkung', () => {
        const e = berichtEintraege(
          bericht({
            kennzeichenLage: [lage({ markiert: ['rolle'], ohneTrennwirkung: ['rolle'] })],
          }),
        );
        expect(e.some((x) => x.text.includes('trennt die Vorkommen nicht'))).toBeTrue();
      });
    });
  });
});
