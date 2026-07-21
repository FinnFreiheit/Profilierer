import { byName, esc, escapeRegExp, leafValue } from './xml.util';

const el = (xml: string): Element =>
  new DOMParser().parseFromString(xml, 'application/xml').documentElement!;

describe('xml.util', () => {
  describe('byName', () => {
    it('liefert nur direkte Kinder mit passendem lokalen Namen', () => {
      const root = el('<a xmlns:x="urn:x"><b/><x:b/><c><b/></c></a>');
      expect(byName(root, 'b').length).toBe(2); // b und x:b, nicht das verschachtelte
      expect(byName(root, 'c').length).toBe(1);
      expect(byName(root, 'fehlt').length).toBe(0);
    });
  });

  describe('leafValue', () => {
    it('liest den Text eines einfachen Blatts (getrimmt)', () => {
      expect(leafValue(el('<a>  Wert \n</a>'), false)).toBe('Wert');
      expect(leafValue(el('<a/>'), false)).toBe('');
    });

    it('liest bei Codelisten den <code>-Inhalt, sonst den Gesamttext', () => {
      expect(leafValue(el('<a><code>12</code><name>AG</name></a>'), true)).toBe('12');
      expect(leafValue(el('<a>12</a>'), true)).toBe('12'); // kein <code>-Kind
    });
  });

  describe('esc / escapeRegExp', () => {
    it('esc ersetzt die vier XML-Sonderzeichen', () => {
      expect(esc('a<b>&"c')).toBe('a&lt;b&gt;&amp;&quot;c');
      expect(esc(null)).toBe('');
    });

    it('escapeRegExp entschaerft Regex-Metazeichen', () => {
      expect(new RegExp(escapeRegExp('a.b*c')).test('a.b*c')).toBeTrue();
      expect(new RegExp(escapeRegExp('a.b*c')).test('aXbbc')).toBeFalse();
    });
  });
});
