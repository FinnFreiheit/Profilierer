import { konformerBeispielwert, sampleFromPattern } from './pattern-sample.util';

/** Anchored-Match wie in der XSD-Pattern-Semantik. */
function passt(sample: string | null, pattern: string): boolean {
  return sample !== null && new RegExp('^(?:' + pattern + ')$', 'u').test(sample);
}

describe('sampleFromPattern', () => {
  it('erzeugt ein volles Datum fuer Type.GDS.Datumsangabe (optionale Teile sichtbar)', () => {
    const p = '\\d{4}((-\\d{2}){0,1}-\\d{2}){0,1}';
    const s = sampleFromPattern(p);
    expect(passt(s, p)).toBeTrue();
    expect(s).toBe('1111-11-11');
  });

  it('erzeugt eine gueltige UUID (Type.GDS.Xdomea.stringUUIDType)', () => {
    const p = '[0-9|A-F|a-f]{8}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{12}';
    expect(passt(sampleFromPattern(p), p)).toBeTrue();
  });

  it('nimmt bei Alternativen den ersten Zweig', () => {
    const p = '(ja|nein)';
    expect(sampleFromPattern(p)).toBe('ja');
  });

  it('behandelt Quantoren: exakte Anzahl, ?, + und *', () => {
    for (const p of ['\\d{5}', 'a?b+c*', '([A-Z]\\d){2}']) {
      expect(passt(sampleFromPattern(p), p)).toBeTrue();
    }
  });

  it('bevorzugt in Zeichenklassen lesbare Zeichen und respektiert Negation', () => {
    expect(sampleFromPattern('[abc]')).toBe('a');
    expect(passt(sampleFromPattern('[^0-9]'), '[^0-9]')).toBeTrue();
  });

  it('liefert null bei nicht unterstuetzter Syntax statt falscher Werte', () => {
    expect(sampleFromPattern('a{2,')).toBeNull();
  });
});

describe('konformerBeispielwert', () => {
  const KANDIDATEN = ['2026-01-01', '12:00:00', '1', 'true'];

  it('behaelt den Fallback, wenn er das Pattern schon erfuellt', () => {
    expect(konformerBeispielwert(['[A-Za-z]+'], KANDIDATEN, 'Beispieltext')).toBe('Beispieltext');
  });

  it('waehlt den passenden Kandidaten (Datumsangabe bekommt ein echtes Datum)', () => {
    const p = '\\d{4}((-\\d{2}){0,1}-\\d{2}){0,1}';
    expect(konformerBeispielwert([p], KANDIDATEN, 'Beispieltext')).toBe('2026-01-01');
  });

  it('generiert aus dem Pattern, wenn kein Kandidat passt', () => {
    const p = '[0-9|A-F|a-f]{8}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{4}-[0-9|A-F|a-f]{12}';
    const s = konformerBeispielwert([p], KANDIDATEN, 'Beispieltext');
    expect(passt(s, p)).toBeTrue();
  });

  it('mehrere Patterns sind Alternativen — ein Treffer genuegt', () => {
    expect(konformerBeispielwert(['\\d{2}', '[a-z]+'], [], 'abc')).toBe('abc');
  });

  it('gibt den Fallback zurueck, wenn kein Pattern kompilierbar ist', () => {
    expect(konformerBeispielwert(['a{2,'], KANDIDATEN, 'Beispieltext')).toBe('Beispieltext');
  });
});
