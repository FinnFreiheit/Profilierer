import { alsText, endung, groesseText, vorschauArt } from './anlage-vorschau.util';

describe('anlage-vorschau.util', () => {
  it('Endung entscheidet vor dem MIME-Typ', () => {
    expect(vorschauArt('a.pdf', 'application/octet-stream')).toBe('pdf');
    expect(vorschauArt('xjustiz_nachricht_1.xml', null)).toBe('xml');
    expect(vorschauArt('a.pdf.pkcs7', 'application/pkcs7-signature')).toBe('binaer');
    expect(vorschauArt('scan.png')).toBe('bild');
  });

  it('ohne bekannte Endung zaehlt der MIME-Typ; TIFF bleibt binaer', () => {
    expect(vorschauArt('datei', 'application/pdf')).toBe('pdf');
    expect(vorschauArt('datei', 'text/xml')).toBe('xml');
    expect(vorschauArt('datei', 'image/tiff')).toBe('binaer');
    expect(vorschauArt('scan.tif', 'image/tiff')).toBe('binaer');
    expect(vorschauArt('datei')).toBe('binaer');
  });

  it('endung: klein, ohne Punkt, leer ohne Punkt', () => {
    expect(endung('A.PDF')).toBe('pdf');
    expect(endung('ohne')).toBe('');
  });

  it('alsText folgt der Kodierung der XML-Deklaration', () => {
    const latin1 = new Uint8Array([
      ...new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?><a>'),
      0xfc, // ü in ISO-8859-1
      ...new TextEncoder().encode('</a>'),
    ]);
    expect(alsText(latin1)).toContain('<a>ü</a>');
    expect(alsText(new TextEncoder().encode('<a>Straße</a>'))).toBe('<a>Straße</a>');
  });

  it('groesseText', () => {
    expect(groesseText(980)).toBe('980 B');
    expect(groesseText(311306)).toBe('304,0 KB');
    expect(groesseText(2 * 1024 * 1024)).toBe('2,0 MB');
  });
});
