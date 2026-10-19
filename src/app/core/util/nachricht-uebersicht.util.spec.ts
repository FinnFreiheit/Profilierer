import { formatiereWert, nachrichtUebersicht, UebersichtZeile } from './nachricht-uebersicht.util';

// Gekuerzt aus einer echten Testnachricht (JN_untrennbare_Verbindung.xml).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.enova.entscheidung.2900003 xmlns="http://www.xjustiz.de">
  <nachrichtenkopf xjustizVersion="3.6.2">
    <erstellungszeitpunkt>2026-10-16T13:17:06Z</erstellungszeitpunkt>
    <absender>
      <informationen>
        <auswahl_kommunikationspartner>
          <gericht listURI="urn:xoev-de:xjustiz:codeliste:gds.gerichte" listVersionID="3.7">
            <code xmlns="">F1112</code>
          </gericht>
        </auswahl_kommunikationspartner>
      </informationen>
      <aktenzeichen>20IV/2026</aktenzeichen>
      <eigeneNachrichtenID>9c9f46b6-171e-4e8a-baec-1ed2421c8f3f</eigeneNachrichtenID>
    </absender>
    <herstellerinformation>
      <nameDesProdukts>Pfadfinder</nameDesProdukts>
    </herstellerinformation>
  </nachrichtenkopf>
  <grunddaten>
    <verfahrensdaten>
      <beteiligung>
        <rolle><rollennummer>1</rollennummer></rolle>
        <beteiligter>
          <auswahl_beteiligter>
            <natuerlichePerson>
              <vollerName><vorname>Erika</vorname><nachname>Mustermann</nachname></vollerName>
              <anschrift>
                <anschriftstyp listURI="urn:typ"><code xmlns="">003</code></anschriftstyp>
                <strasse>Notarenstr.</strasse>
                <hausnummer>11</hausnummer>
                <postleitzahl>10117</postleitzahl>
              </anschrift>
            </natuerlichePerson>
          </auswahl_beteiligter>
        </beteiligter>
      </beteiligung>
      <beteiligung>
        <rolle><rollennummer>2</rollennummer></rolle>
      </beteiligung>
    </verfahrensdaten>
  </grunddaten>
  <schriftgutobjekte>
    <dokument>
      <identifikation><id>96df769f-625f-440a-92bc-13d153823d60</id></identifikation>
      <xjustiz.fachspezifischeDaten>
        <anzeigename>Beschluss</anzeigename>
      </xjustiz.fachspezifischeDaten>
    </dokument>
    <dokument>
      <xjustiz.fachspezifischeDaten>
        <anzeigename>Rechtskraftzeugnis</anzeigename>
        <verweis>
          <verweistyp listURI="urn:verweistyp"><code xmlns="">001</code></verweistyp>
          <bezugsdokument><ref.sgo>96df769f-625f-440a-92bc-13d153823d60</ref.sgo></bezugsdokument>
        </verweis>
        <verweis>
          <verweistyp listURI="urn:verweistyp"><code xmlns="">001</code></verweistyp>
          <bezugsdokument><ref.sgo>11111111-2222-3333-4444-555555555555</ref.sgo></bezugsdokument>
        </verweis>
      </xjustiz.fachspezifischeDaten>
    </dokument>
  </schriftgutobjekte>
</nachricht.enova.entscheidung.2900003>`;

const kurz = (z: UebersichtZeile) =>
  `${'  '.repeat(z.ebene)}${z.name}${z.wert != null ? ': ' + z.wert : ''}${z.zusatz ? ' (' + z.zusatz + ')' : ''}`;

describe('nachrichtUebersicht', () => {
  const bez = (uri: string, code: string) =>
    uri.endsWith('gds.gerichte') && code === 'F1112' ? 'AG Beispielstadt' : null;

  it('liest Kopfdaten und bildet je Hauptelement einen Abschnitt', () => {
    const u = nachrichtUebersicht(XML, bez)!;
    expect(u.nachricht).toBe('nachricht.enova.entscheidung.2900003');
    expect(u.titel).toBe('Enova — Entscheidung');
    expect(u.version).toBe('3.6.2');
    expect(u.abschnitte.map((a) => a.titel)).toEqual([
      'Nachrichtenkopf',
      'Grunddaten',
      'Schriftgutobjekte',
    ]);
  });

  it('folgt der Gliederung, ueberspringt Huellen und Technisches', () => {
    const kopf = nachrichtUebersicht(XML, bez)!.abschnitte[0]!.zeilen.map(kurz);
    expect(kopf).toEqual([
      'Erstellungszeitpunkt: 16.10.2026 13:17 UTC',
      'Absender',
      '  Gericht: F1112 (AG Beispielstadt)',
      '  Aktenzeichen: 20IV/2026',
    ]);
  });

  it('nummeriert Wiederholungen und fasst Name und Anschrift zusammen', () => {
    const gd = nachrichtUebersicht(XML)!.abschnitte[1]!.zeilen.map(kurz);
    expect(gd).toEqual([
      'Verfahrensdaten',
      '  Beteiligung 1',
      '    Rollennummer: 1',
      '    Natuerliche Person',
      '      Name: Erika Mustermann',
      '      Anschrift: Notarenstr. 11, 10117 (Typ 003)',
      '  Beteiligung 2',
      '    Rollennummer: 2',
    ]);
  });

  it('loest xjustiz.fachspezifischeDaten auf', () => {
    const sgo = nachrichtUebersicht(XML)!.abschnitte[2]!.zeilen.map(kurz);
    expect(sgo.slice(0, 2)).toEqual(['Dokument 1', '  Anzeigename: Beschluss']);
  });

  it('loest das Bezugsdokument eines Verweises auf das Dokument auf', () => {
    const sgo = nachrichtUebersicht(XML)!.abschnitte[2]!.zeilen.map(kurz);
    expect(sgo.slice(2)).toEqual([
      'Dokument 2',
      '  Anzeigename: Rechtskraftzeugnis',
      '  Verweis 1',
      '    Verweistyp: 001',
      '    Bezugsdokument: Dokument 1 (Beschluss)',
      '  Verweis 2',
      '    Verweistyp: 001',
      '    Bezugsdokument: 11111111-2222-3333-4444-555555555555 (nicht in dieser Nachricht)',
    ]);
  });

  it('liefert null bei unlesbarem XML', () => {
    expect(nachrichtUebersicht('<kaputt')).toBeNull();
  });
});

describe('formatiereWert', () => {
  it('setzt Datum, Zeit und Wahrheitswerte deutsch', () => {
    expect(formatiereWert('2020-12-24')).toBe('24.12.2020');
    expect(formatiereWert('2026-10-16T13:17:06+02:00')).toBe('16.10.2026 13:17');
    expect(formatiereWert('true')).toBe('ja');
    expect(formatiereWert('20IV/2026')).toBe('20IV/2026');
  });
});
