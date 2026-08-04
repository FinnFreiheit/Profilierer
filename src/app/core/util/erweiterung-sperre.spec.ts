import { ERW_SPERRE_GRUND, erweiterungsWarnung, sperrtPruefartefakte } from './erweiterung-sperre';

describe('Erweiterungs-Sperre (#98)', () => {
  describe('Sperrkriterium', () => {
    it('sperrt, sobald eine Erweiterung im Arbeitsstand haengt', () => {
      expect(sperrtPruefartefakte(1)).toBeTrue();
      expect(sperrtPruefartefakte(7)).toBeTrue();
    });

    it('laesst ein Profil ohne Erweiterungen frei', () => {
      expect(sperrtPruefartefakte(0)).toBeFalse();
    });

    it('behandelt alte Server-Zeilen ohne nErw als frei', () => {
      // LibraryEntry.nErw fehlt im Altbestand — ein fehlender Zaehler darf
      // nicht sperren, sonst waere schlagartig die halbe Bibliothek gesperrt.
      expect(sperrtPruefartefakte(undefined)).toBeFalse();
      expect(sperrtPruefartefakte(null)).toBeFalse();
    });

    it('nennt als Begruendung die fehlende Gueltigkeit der Nachricht', () => {
      expect(ERW_SPERRE_GRUND).toBe(
        'Enthält Schema-Erweiterungen — nachbeauftragte Elemente ergeben keine gültige XJustiz-Nachricht.',
      );
    });
  });

  describe('Warnkommentar im Beispiel-XML', () => {
    it('nennt die aktive Schemaversion', () => {
      expect(erweiterungsWarnung('3.6.2')).toBe(
        '<!-- Enthält nachbeauftragte Elemente — gegen XJustiz 3.6.2 nicht gültig. -->',
      );
    });

    it('bleibt ohne geladene Version lesbar', () => {
      expect(erweiterungsWarnung('')).toBe(
        '<!-- Enthält nachbeauftragte Elemente — gegen das XJustiz-Schema nicht gültig. -->',
      );
    });
  });
});
