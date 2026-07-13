import { parseTestmessage } from './testmessage.util';

describe('testmessage.util', () => {
  describe('parseTestmessage', () => {
    it('leitet Nachricht und Fachmodul aus dem Wurzelelement ab', () => {
      const xml = '<nachricht.dabag.antrag.2900001 xmlns="http://www.xjustiz.de"/>';
      expect(parseTestmessage(xml)).toEqual({ nachricht: 'nachricht.dabag.antrag.2900001', fachmodul: 'dabag' });
    });

    it('akzeptiert ein Wurzelelement mit Namespace-Präfix (tns:)', () => {
      const xml =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<tns:nachricht.enova.entscheidung.2900003 xmlns:tns="http://www.xjustiz.de">' +
        '<tns:nachrichtenkopf/></tns:nachricht.enova.entscheidung.2900003>';
      expect(parseTestmessage(xml)).toEqual({
        nachricht: 'nachricht.enova.entscheidung.2900003',
        fachmodul: 'enova',
      });
    });

    it('liest ein xjustizVersion-Attribut best-effort', () => {
      const xml = '<nachricht.enova.entscheidung.2900003 xjustizVersion="3.6.2"/>';
      expect(parseTestmessage(xml)).toEqual({
        nachricht: 'nachricht.enova.entscheidung.2900003',
        fachmodul: 'enova',
        xjustizVersion: '3.6.2',
      });
    });

    it('liest die Version aus dem nachrichtenkopf (echte XJustiz-Struktur)', () => {
      const xml =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<tns:nachricht.enova.entscheidung.2900003 xmlns:tns="http://www.xjustiz.de">' +
        '<tns:nachrichtenkopf xjustizVersion="3.6.2"/>' +
        '</tns:nachricht.enova.entscheidung.2900003>';
      expect(parseTestmessage(xml)).toEqual({
        nachricht: 'nachricht.enova.entscheidung.2900003',
        fachmodul: 'enova',
        xjustizVersion: '3.6.2',
      });
    });

    it('lehnt Nicht-XJustiz-Wurzelelemente ab', () => {
      expect(parseTestmessage('<CodeList/>')).toBeNull();
      expect(parseTestmessage('<beliebig.dabag.antrag/>')).toBeNull();
    });

    it('lehnt kaputtes XML ab', () => {
      expect(parseTestmessage('<nachricht.dabag.antrag>')).toBeNull();
      expect(parseTestmessage('kein xml')).toBeNull();
    });
  });
});
