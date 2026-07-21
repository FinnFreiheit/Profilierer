import { firstLine, fmtKard, kardText, pretty } from './pretty.util';

describe('pretty.util', () => {
  describe('pretty', () => {
    it('formatiert nachricht.*-Namen', () => {
      expect(pretty('nachricht.enova.entscheidung.2900003')).toBe('Enova — Entscheidung');
    });
    it('kennzeichnet Auswahl und Verweis', () => {
      expect(pretty('auswahl_beteiligung')).toBe('Auswahl: Beteiligung');
      expect(pretty('ref.rollennummer')).toBe('Verweis: Rollennummer');
    });
    it('trennt camelCase und snake/dot', () => {
      expect(pretty('vorname')).toBe('Vorname');
      expect(pretty('istNatuerlichePerson')).toBe('Ist Natuerliche Person');
      expect(pretty('auswahl_beteiligter.gericht')).toBe('Auswahl: Beteiligter gericht');
    });
  });

  describe('kardText', () => {
    it('deckt die Standardfaelle ab', () => {
      expect(kardText('1', '1')).toBe('genau 1');
      expect(kardText('0', '1')).toBe('0 oder 1');
      expect(kardText('0', 'unbounded')).toBe('beliebig viele');
      expect(kardText('1', 'unbounded')).toBe('mindestens 1, mehrfach');
      expect(kardText('2', '2')).toBe('genau 2');
      expect(kardText('1', '3')).toBe('1 bis 3');
    });
  });

  describe('fmtKard', () => {
    it('kompakte Schreibweise', () => {
      expect(fmtKard('1', '1')).toBe('1');
      expect(fmtKard('0', 'unbounded')).toBe('0..*');
      expect(fmtKard('1', '3')).toBe('1..3');
    });
  });

  describe('firstLine', () => {
    it('liefert die erste Zeile eines mehrzeiligen Texts', () => {
      expect(firstLine('erste\nzweite')).toBe('erste');
      expect(firstLine('einzeilig')).toBe('einzeilig');
    });
  });
});
