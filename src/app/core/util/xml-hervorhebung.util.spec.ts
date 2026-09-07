import { XmlToken, kommentarOffen, tokenisiereXmlZeile } from './xml-hervorhebung.util';

/** Kurzform fuer die Erwartung: nur Art und Text, in Reihenfolge. */
const paare = (t: XmlToken[]): [string, string][] => t.map((m) => [m.art, m.text]);

describe('tokenisiereXmlZeile', () => {
  it('nimmt die Deklaration ganz als eigene Marke', () => {
    expect(paare(tokenisiereXmlZeile('<?xml version="1.0" encoding="UTF-8"?>'))).toEqual([
      ['dekl', '<?xml version="1.0" encoding="UTF-8"?>'],
    ]);
  });

  it('faerbt Tag, Attribut, Attributwert und Wert getrennt', () => {
    const t = tokenisiereXmlZeile('  <az listURI="urn:test">4711</az>');
    expect(paare(t)).toEqual([
      ['text', '  '],
      ['tag', '<az'],
      ['tag', ' '],
      ['attr', 'listURI='],
      ['attrwert', '"urn:test"'],
      ['tag', '>'],
      ['wert', '4711'],
      ['tag', '</az'],
      ['tag', '>'],
    ]);
  });

  it('erkennt den Standard-Namensraum an der Wurzel als Attribut', () => {
    const t = tokenisiereXmlZeile('<nachricht.test xmlns="http://www.xjustiz.de">');
    expect(paare(t)).toEqual([
      ['tag', '<nachricht.test'],
      ['tag', ' '],
      ['attr', 'xmlns='],
      ['attrwert', '"http://www.xjustiz.de"'],
      ['tag', '>'],
    ]);
  });

  it('zerlegt ein Leerelement ohne Wertmarke', () => {
    expect(paare(tokenisiereXmlZeile('<a/>'))).toEqual([
      ['tag', '<a'],
      ['tag', '/>'],
    ]);
  });

  it('gibt einen einzeiligen Kommentar als Kommentar aus', () => {
    expect(paare(tokenisiereXmlZeile('  <!-- noch keine Angabe gewählt -->'))).toEqual([
      ['text', '  '],
      ['kommentar', '<!-- noch keine Angabe gewählt -->'],
    ]);
  });

  it('faerbt die Folgezeilen eines mehrzeiligen Kommentars mit', () => {
    const z1 = '<!-- Beispielnachricht (Entwurf)';
    const z2 = '     Platzhalter fachlich prüfen. -->';
    const offen = kommentarOffen(z1);
    expect(offen).toBe(true);
    expect(paare(tokenisiereXmlZeile(z1))).toEqual([['kommentar', z1]]);
    expect(paare(tokenisiereXmlZeile(z2, offen))).toEqual([['kommentar', z2]]);
    expect(kommentarOffen(z2, offen)).toBe(false);
  });

  it('behandelt eine Zeile ohne Tag als Einrueckung und Text', () => {
    expect(paare(tokenisiereXmlZeile('    freier Text'))).toEqual([
      ['text', '    '],
      ['wert', 'freier Text'],
    ]);
    expect(tokenisiereXmlZeile('')).toEqual([]);
  });

  it('haelt den Zeilentext verlustfrei zusammen', () => {
    const zeile = '    <code xmlns="">urn:xj:0815</code>';
    expect(
      tokenisiereXmlZeile(zeile)
        .map((m) => m.text)
        .join(''),
    ).toBe(zeile);
  });
});

describe('kommentarOffen', () => {
  it('meldet geschlossene Zeilen als geschlossen', () => {
    expect(kommentarOffen('<!-- a --> <b/>')).toBe(false);
    expect(kommentarOffen('<b/>')).toBe(false);
  });

  it('meldet einen offenen Kommentar bis zum Abschluss', () => {
    expect(kommentarOffen('<b/> <!-- a')).toBe(true);
    expect(kommentarOffen('noch drin', true)).toBe(true);
    expect(kommentarOffen('Ende -->', true)).toBe(false);
  });
});
