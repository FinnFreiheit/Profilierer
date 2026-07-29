import { TestBed } from '@angular/core/testing';
import { XmlDiffService } from './xml-diff.service';

describe('XmlDiffService', () => {
  let svc: XmlDiffService;
  beforeEach(() => {
    svc = TestBed.inject(XmlDiffService);
  });

  const BASIS = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.x xmlns="http://www.xjustiz.de">
  <grunddaten aktenzeichen="1 C 2/26">
    <beteiligung><id>B-1</id><nachname>Müller</nachname></beteiligung>
    <beteiligung><id>B-2</id><nachname>Schmidt</nachname></beteiligung>
  </grunddaten>
</nachricht.x>`;

  it('meldet geaenderte Blattwerte mit Pfad, alt und neu', () => {
    const neu = BASIS.replace('Müller', 'Meier');
    const r = svc.vergleiche(BASIS, neu);
    expect(r.eintraege.length).toBe(1);
    const e = r.eintraege[0]!;
    expect(e.art).toBe('geändert');
    expect(e.pfad).toBe('nachricht.x/grunddaten/beteiligung{id=B-1}/nachname');
    expect(e.name).toBe('nachname');
    expect(e.vorher).toBe('Müller');
    expect(e.nachher).toBe('Meier');
    expect(r.zaehler['geändert']).toBe(1);
  });

  it('meldet geaenderte Attribute getrennt vom Elementwert', () => {
    const neu = BASIS.replace('1 C 2/26', '1 C 9/26');
    const e = svc.vergleiche(BASIS, neu).eintraege[0]!;
    expect(e.attribut).toBe('aktenzeichen');
    expect(e.pfad).toBe('nachricht.x/grunddaten');
    expect(e.vorher).toBe('1 C 2/26');
    expect(e.nachher).toBe('1 C 9/26');
  });

  it('fasst einen neuen Teilbaum zu einem Eintrag zusammen', () => {
    const neu = BASIS.replace(
      '</grunddaten>',
      '<anschrift><ort>Kiel</ort><plz>24103</plz></anschrift></grunddaten>',
    );
    const r = svc.vergleiche(BASIS, neu);
    expect(r.eintraege.length).toBe(1);
    expect(r.eintraege[0]!.art).toBe('neu');
    expect(r.eintraege[0]!.name).toBe('anschrift');
    // Zwei Nachfahren — nicht zwei Eintraege.
    expect(r.eintraege[0]!.unterElemente).toBe(2);
  });

  it('fasst einen entfallenen Teilbaum ebenso zusammen', () => {
    const ohne = BASIS.replace(
      '<beteiligung><id>B-2</id><nachname>Schmidt</nachname></beteiligung>',
      '',
    );
    const r = svc.vergleiche(BASIS, ohne);
    expect(r.eintraege.length).toBe(1);
    expect(r.eintraege[0]!.art).toBe('entfernt');
    expect(r.eintraege[0]!.pfad).toBe('nachricht.x/grunddaten/beteiligung{id=B-2}');
    expect(r.zaehler.entfernt).toBe(1);
  });

  it('ignoriert Formatierung, Praefixe und Selbstschluss-Schreibweise', () => {
    // Dieselben Daten, voellig andere Serialisierung — ein Zeilendiff wuerde
    // hier fast jede Zeile melden. Das ist der Grund fuer den Strukturvergleich.
    const anders = `<?xml version="1.0"?>
<xj:nachricht.x xmlns:xj="http://www.xjustiz.de"><xj:grunddaten aktenzeichen="1 C 2/26">
        <xj:beteiligung>
            <xj:id>B-1</xj:id>
            <xj:nachname>Müller</xj:nachname>
        </xj:beteiligung>
        <xj:beteiligung><xj:id>B-2</xj:id><xj:nachname>Schmidt</xj:nachname></xj:beteiligung>
</xj:grunddaten></xj:nachricht.x>`;
    const r = svc.vergleiche(BASIS, anders);
    expect(r.eintraege.length).toBe(0);
  });

  it('haelt die Zuordnung ueber den fachlichen Schluessel stabil', () => {
    // Neue Beteiligung ganz vorn: genau ein "neu", keine Wertaenderungen.
    const neu = BASIS.replace(
      '<beteiligung><id>B-1</id>',
      '<beteiligung><id>B-0</id><nachname>Neu</nachname></beteiligung><beteiligung><id>B-1</id>',
    );
    const r = svc.vergleiche(BASIS, neu);
    expect(r.eintraege.length).toBe(1);
    expect(r.eintraege[0]!.art).toBe('neu');
    expect(r.eintraege[0]!.pfad).toBe('nachricht.x/grunddaten/beteiligung{id=B-0}');
  });

  it('faellt ohne Schluesselkind auf den Positionsindex zurueck', () => {
    const a = `<w xmlns="u"><d><t>A</t></d><d><t>B</t></d></w>`;
    const b = `<w xmlns="u"><d><t>A</t></d><d><t>C</t></d></w>`;
    const r = svc.vergleiche(a, b);
    expect(r.eintraege.length).toBe(1);
    expect(r.eintraege[0]!.pfad).toBe('w/d[2]/t');
    expect(r.eintraege[0]!.nachher).toBe('C');
  });

  it('laesst den Index weg, wenn es nur ein Vorkommen gibt', () => {
    const a = `<w xmlns="u"><d><t>A</t></d></w>`;
    const b = `<w xmlns="u"><d><t>B</t></d></w>`;
    expect(svc.vergleiche(a, b).eintraege[0]!.pfad).toBe('w/d/t');
  });

  it('bricht bei abweichenden Wurzelelementen mit einem Hinweis ab', () => {
    const r = svc.vergleiche(BASIS, `<nachricht.y xmlns="http://www.xjustiz.de"/>`);
    expect(r.eintraege.length).toBe(0);
    expect(r.wurzelUnterschied).toEqual({ vorher: 'nachricht.x', nachher: 'nachricht.y' });
  });

  it('wirft bei nicht lesbarem XML', () => {
    expect(() => svc.vergleiche(BASIS, '<offen>')).toThrowError(/nicht lesbar/);
  });
});
