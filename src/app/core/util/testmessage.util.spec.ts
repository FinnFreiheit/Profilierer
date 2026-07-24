import { frageTestnachrichtName, parseTestmessage, testmessageInput } from './testmessage.util';

describe('testmessage.util', () => {
  describe('parseTestmessage', () => {
    it('leitet Nachricht und Fachmodul aus dem Wurzelelement ab', () => {
      const xml = '<nachricht.dabag.antrag.2900001 xmlns="http://www.xjustiz.de"/>';
      expect(parseTestmessage(xml)).toEqual({
        nachricht: 'nachricht.dabag.antrag.2900001',
        fachmodul: 'dabag',
      });
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

  describe('frageTestnachrichtName', () => {
    it('liefert die Eingabe getrimmt; leer faellt auf den Vorschlag zurueck', () => {
      spyOn(window, 'prompt').and.returnValue('  Mein Name  ');
      expect(frageTestnachrichtName('Vorschlag.xml')).toBe('Mein Name');
      (window.prompt as jasmine.Spy).and.returnValue('   ');
      expect(frageTestnachrichtName('Vorschlag.xml')).toBe('Vorschlag.xml');
    });

    it('liefert null bei Abbruch', () => {
      spyOn(window, 'prompt').and.returnValue(null);
      expect(frageTestnachrichtName('Vorschlag.xml')).toBeNull();
    });
  });

  describe('testmessageInput', () => {
    it('baut den Testspeicher-Eintrag aus XML und Root-Metadaten', () => {
      const meta = {
        nachricht: 'nachricht.enova.entscheidung.2900003',
        fachmodul: 'enova',
        xjustizVersion: '3.6.2',
      };
      expect(testmessageInput('N', '<x/>', meta)).toEqual({
        name: 'N',
        xml: '<x/>',
        nachricht: meta.nachricht,
        fachmodul: 'enova',
        xjustizVersion: '3.6.2',
        groesse: 4,
      });
    });
  });
});
