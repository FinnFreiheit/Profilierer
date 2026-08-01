import {
  auspTeile,
  blattName,
  istErweiterungsPfad,
  letztesVorkommenPfad,
  ohneVorkommen,
  segmentKette,
  unterPfad,
  vorfahren,
} from './pfad.util';

/**
 * Die Pfad-Grammatik ist ein pures Modul — die Tests decken vor allem die
 * Grenzzeichen ab, deren Fehlen die alten Streu-Implementierungen anfaellig
 * machte: '/' und '@' als Grenze, Namens- und id-Praefix-Kollisionen.
 */
describe('pfad.util', () => {
  const P = 'nachricht.test.0001/beteiligung@a1/anschrift@b2/ort';

  it('ohneVorkommen entfernt jede Vorkommens-id', () => {
    expect(ohneVorkommen(P)).toBe('nachricht.test.0001/beteiligung/anschrift/ort');
    expect(ohneVorkommen('m/kopf')).toBe('m/kopf');
  });

  it('istErweiterungsPfad erkennt den ~-Marker', () => {
    expect(istErweiterungsPfad('m/kopf/~e1')).toBeTrue();
    expect(istErweiterungsPfad('m/kopf')).toBeFalse();
  });

  it('vorfahren liefert alle Praefixe an / und @, aufsteigend', () => {
    expect(vorfahren('m/beteiligung@a1/rolle')).toEqual([
      'm',
      'm/beteiligung', // das Traegerelement — als dessen Kind rendert das Vorkommen
      'm/beteiligung@a1',
    ]);
    expect(vorfahren('m')).toEqual([]);
  });

  describe('unterPfad', () => {
    it('trifft sich selbst, Kinder und Vorkommen', () => {
      expect(unterPfad('m/anlage', 'm/anlage')).toBeTrue();
      expect(unterPfad('m/anlage/name', 'm/anlage')).toBeTrue();
      expect(unterPfad('m/anlage@a1/name', 'm/anlage')).toBeTrue();
    });

    it('Namens-Praefix ist kein Treffer: anlage trifft anlageArt nicht', () => {
      expect(unterPfad('m/anlageArt', 'm/anlage')).toBeFalse();
    });

    it('id-Praefix ist kein Treffer: @a1 trifft @a12 nicht', () => {
      // Die Fehlerklasse der nackten startsWith-Stellen: ids entstehen als
      // Zeitstempel+Zaehler, ein Praefix-Zusammenstoss ist konstruierbar.
      expect(unterPfad('m/bet@a12/name', 'm/bet@a1')).toBeFalse();
      expect(unterPfad('m/bet@a1/name', 'm/bet@a1')).toBeTrue();
    });
  });

  it('segmentKette oeffnet jeden Schritt inkl. Traeger vor dem @', () => {
    expect(segmentKette('m/beteiligung@a1/ort')).toEqual([
      'm',
      'm/beteiligung', // Traeger — muss offen sein, damit das Vorkommen sichtbar ist
      'm/beteiligung@a1',
      'm/beteiligung@a1/ort',
    ]);
  });

  describe('auspTeile', () => {
    it('zerlegt einen Vorkommens-Pfad in Liste und id', () => {
      expect(auspTeile('m/beteiligung@a1')).toEqual({ listPfad: 'm/beteiligung', auspId: 'a1' });
    });

    it('ein Element IM Vorkommen ist kein Vorkommen', () => {
      expect(auspTeile('m/beteiligung@a1/name')).toBeNull();
      expect(auspTeile('m/kopf')).toBeNull();
    });
  });

  it('letztesVorkommenPfad findet das innerste umschliessende Vorkommen', () => {
    expect(letztesVorkommenPfad(P)).toBe('nachricht.test.0001/beteiligung@a1/anschrift@b2');
    expect(letztesVorkommenPfad('m/beteiligung@a1/name')).toBe('m/beteiligung@a1');
    expect(letztesVorkommenPfad('m/kopf')).toBeNull();
  });

  it('blattName streift @id und #Disambiguierung', () => {
    expect(blattName('m/beteiligung@a1')).toBe('beteiligung');
    expect(blattName('m/auswahl#2')).toBe('auswahl');
    expect(blattName('m/kopf')).toBe('kopf');
  });
});
