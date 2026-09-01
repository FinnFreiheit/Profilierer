import { diffWorte, vergleicheVersionen } from './diff-richtung.util';

describe('diff-richtung.util', () => {
  describe('vergleicheVersionen', () => {
    it('ordnet Zahlenversionen segmentweise', () => {
      expect(vergleicheVersionen('4.1.0', '4.0.0')).toBe(1);
      expect(vergleicheVersionen('4.0.0', '4.1.0')).toBe(-1);
      expect(vergleicheVersionen('3.6.2', '4.0.0')).toBe(-1);
      // Zehnerstellen dürfen nicht alphabetisch verglichen werden.
      expect(vergleicheVersionen('4.10.0', '4.9.0')).toBe(1);
    });

    it('behandelt fehlende Segmente als 0', () => {
      expect(vergleicheVersionen('4.1', '4.1.0')).toBe(0);
    });

    it('meldet nicht vergleichbare Angaben', () => {
      expect(vergleicheVersionen('Fremdordner', '4.0.0')).toBeNull();
      expect(vergleicheVersionen('4.0.0', '')).toBeNull();
    });
  });

  describe('diffWorte', () => {
    it('blickt nach vorn, wenn die Vergleichsversion die neuere ist', () => {
      const w = diffWorte('4.0.0', '4.1.0');
      expect(w.nurInVergleich.text).toBe('neu in 4.1.0');
      expect(w.nurInBasis.text).toBe('entfällt in 4.1.0');
      expect(w.geaendert.text).toBe('geändert in 4.1.0');
    });

    // Der gemeldete Fall: 4.1.0 geladen, gegen 4.0.0 verglichen. Das nur in
    // 4.0.0 vorhandene auswahl_suchkriterien stand als "neu in 4.0.0" im Baum.
    it('dreht die Aussage um, wenn die Vergleichsversion die ältere ist', () => {
      const w = diffWorte('4.1.0', '4.0.0');
      expect(w.nurInVergleich.text).toBe('entfällt in 4.1.0');
      expect(w.nurInBasis.text).toBe('neu in 4.1.0');
      expect(w.geaendert.text).toBe('geändert in 4.1.0');
      expect(w.nurInVergleich.title).toContain('4.0.0');
    });

    it('bleibt beim Vorwärts-Wortlaut, wenn die Versionen nicht vergleichbar sind', () => {
      const w = diffWorte(undefined, '4.0.0');
      expect(w.nurInVergleich.text).toBe('neu in 4.0.0');
      expect(w.nurInBasis.text).toBe('entfällt in 4.0.0');
    });

    it('lässt die Versionsangabe weg, wenn die Vergleichsversion unbenannt ist', () => {
      const w = diffWorte('4.1.0', undefined);
      expect(w.nurInVergleich.text).toBe('neu');
      expect(w.nurInBasis.text).toBe('entfällt');
      expect(w.geaendert.text).toBe('geändert');
    });

    it('dreht bei gleicher Version nicht um', () => {
      const w = diffWorte('4.0.0', '4.0.0');
      expect(w.nurInBasis.text).toBe('entfällt in 4.0.0');
    });
  });
});
