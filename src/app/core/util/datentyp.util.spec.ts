import { XsdParserService } from '../services/xsd-parser.service';
import { XsdIndex } from '../../models/xsd-index.model';
import {
  datentypAnzeige,
  datentypGruppen,
  datentypQuelleOf,
  datentypUnbekannt,
  filterGruppen,
} from './datentyp.util';

/**
 * Test-Index mit je einem Vertreter der vier Gruppen — plus den beiden Faellen,
 * die bewusst *nicht* in der Liste stehen: die Codelisten-Restriktion hinter
 * einem `Code.*` und die Nachricht selbst.
 */
const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.gds.test.0001" type="Type.GDS.Akte"/>
  <xs:complexType name="Type.GDS.Akte">
    <xs:annotation><xs:documentation>Die Akte eines Verfahrens.
Zweite Zeile.</xs:documentation></xs:annotation>
    <xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.STRAF.Anklage"/>
  <xs:complexType name="Type.GDS.Ref.Beteiligter"/>
  <xs:complexType name="Code.GDS.Aktentyp">
    <xs:annotation><xs:appinfo>
      <codeliste><nameLang>Aktentyp</nameLang><kennung>urn:test:cl</kennung></codeliste>
    </xs:appinfo></xs:annotation>
    <xs:sequence><xs:element name="code" type="gds.aktentyp"/></xs:sequence>
  </xs:complexType>
  <xs:simpleType name="Type.GDS.Aktenzeichen">
    <xs:restriction base="xs:string"/>
  </xs:simpleType>
  <xs:simpleType name="gds.aktentyp">
    <xs:restriction base="xs:token"><xs:enumeration value="001"/></xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="datatypeA">
    <xs:annotation>
      <xs:appinfo><datentyp><nameLang>Datentyp A</nameLang></datentyp></xs:appinfo>
      <xs:documentation>Der Datentyp A wurde vor allem fuer Namen entworfen.</xs:documentation>
    </xs:annotation>
    <xs:restriction base="xs:string"/>
  </xs:simpleType>
  <xs:simpleType name="datatypeC">
    <xs:annotation>
      <xs:appinfo><datentyp><nameLang>Datentyp C</nameLang></datentyp></xs:appinfo>
    </xs:annotation>
    <xs:restriction base="xs:string"/>
  </xs:simpleType>
</xs:schema>`;

function testIndex(): XsdIndex {
  const dom = new DOMParser().parseFromString(XSD, 'application/xml');
  return new XsdParserService().buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx;
}

/** Namen einer Gruppe, ueber alle Gruppen hinweg gesucht. */
function namenVon(titel: string, idx: XsdIndex = testIndex()): string[] {
  return datentypGruppen(idx)
    .filter((g) => g.titel === titel)
    .flatMap((g) => g.eintraege.map((e) => e.name));
}

describe('datentypGruppen — Ableitung aus dem Schema-Index', () => {
  it('fuehrt die kuratierten xs:-Basistypen ohne Schemabezug', () => {
    const basis = namenVon('Basistypen');
    // Haeufig gebraucht, fehlte in der alten hartcodierten Liste (#96).
    expect(basis).toContain('normalizedString');
    expect(basis).toContain('positiveInteger');
    expect(basis).toContain('double');
    // Kommt im XJustiz-Schema nirgends vor und faellt damit weg.
    expect(basis).not.toContain('gYear');
    // Basistypen sind Builtins — nirgends deklariert, also ohne Index-Herkunft.
    expect(namenVon('Basistypen', { ct: {}, st: {}, el: {}, messages: [] })).toEqual(basis);
  });

  it('zieht die DIN-91379-Typen aus den simpleTypes, mit Klartext', () => {
    const din = datentypGruppen(testIndex()).find((g) => g.titel === 'DIN 91379');
    expect(din?.eintraege.map((e) => e.name)).toEqual(['datatypeA', 'datatypeC']);
    expect(din?.eintraege.find((e) => e.name === 'datatypeC')?.info).toBe('Datentyp C (DIN 91379)');
  });

  it('gruppiert die fachlichen Typen nach dem zweiten Namenssegment', () => {
    expect(namenVon('Fachliche Typen · GDS')).toEqual([
      'Type.GDS.Akte',
      // simpleType und complexType stehen nebeneinander in derselben Gruppe
      'Type.GDS.Aktenzeichen',
      'Type.GDS.Ref.Beteiligter',
    ]);
    expect(namenVon('Fachliche Typen · STRAF')).toEqual(['Type.STRAF.Anklage']);
  });

  it('fuehrt die Codelisten als eigene Gruppe, ohne ihre Restriktionen', () => {
    expect(namenVon('Codelisten')).toEqual(['Code.GDS.Aktentyp']);
    // Die ~140 Codelisten-simpleTypes sind die internen Restriktionen dahinter;
    // ein Element bekommt in XJustiz immer den complexType.
    expect(
      datentypGruppen(testIndex()).flatMap((g) => g.eintraege.map((e) => e.name)),
    ).not.toContain('gds.aktentyp');
  });

  it('merkt sich die Herkunft je Eintrag', () => {
    const alle = datentypGruppen(testIndex()).flatMap((g) => g.eintraege);
    expect(alle.find((e) => e.name === 'string')?.quelle).toBe('xs');
    expect(alle.find((e) => e.name === 'Type.GDS.Akte')?.quelle).toBe('schema');
    expect(alle.find((e) => e.name === 'datatypeC')?.quelle).toBe('schema');
  });

  it('nimmt die erste Doku-Zeile als Klartext', () => {
    const alle = datentypGruppen(testIndex()).flatMap((g) => g.eintraege);
    expect(alle.find((e) => e.name === 'Type.GDS.Akte')?.info).toBe('Die Akte eines Verfahrens.');
    expect(alle.find((e) => e.name === 'Code.GDS.Aktentyp')?.info).toBe('Aktentyp');
  });

  it('haelt die Sondereintraege Container und Freitext bereit', () => {
    const sonder = datentypGruppen(testIndex()).find((g) => g.titel === 'Sonstiges');
    expect(sonder?.eintraege.map((e) => e.art)).toEqual(['container', 'frei']);
  });
});

describe('filterGruppen — Suche ueber Name und Doku', () => {
  const alle = datentypGruppen(testIndex());
  const namen = (q: string): string[] =>
    filterGruppen(alle, q).flatMap((g) => g.eintraege.map((e) => e.name || e.label));

  it('gibt ohne Suchbegriff alles zurueck', () => {
    expect(filterGruppen(alle, '  ')).toEqual(alle);
  });

  it('findet ueber den Typnamen, ohne Ruecksicht auf Gross-/Kleinschreibung', () => {
    expect(namen('aktenzeichen')).toEqual(['Type.GDS.Aktenzeichen']);
  });

  it('findet ueber den Klartext', () => {
    // Der Name enthaelt "Verfahren" nicht — nur die Dokumentation.
    expect(namen('verfahrens')).toEqual(['Type.GDS.Akte']);
  });

  it('wirft leergefilterte Gruppen weg', () => {
    expect(filterGruppen(alle, 'aktenzeichen').map((g) => g.titel)).toEqual([
      'Fachliche Typen · GDS',
    ]);
    expect(filterGruppen(alle, 'gibtesnicht')).toEqual([]);
  });

  it('filtert die Sondereintraege mit', () => {
    expect(namen('container')).toEqual(['Container (enthält Unterelemente)']);
  });
});

describe('datentypQuelleOf — Aufloesung fehlender Herkunft', () => {
  it('nimmt die gespeicherte Herkunft, wo sie steht', () => {
    expect(datentypQuelleOf({ datentyp: 'string', datentypQuelle: 'frei' })).toBe('frei');
    expect(datentypQuelleOf({ datentyp: 'Type.GDS.Akte', datentypQuelle: 'schema' })).toBe(
      'schema',
    );
  });

  it('haelt einen kuratierten Basistyp aus dem Altbestand fuer einen xs:-Typ', () => {
    expect(datentypQuelleOf({ datentyp: 'string' })).toBe('xs');
    expect(datentypQuelleOf({ datentyp: 'base64Binary' })).toBe('xs');
  });

  it('haelt alles andere aus dem Altbestand fuer Freitext', () => {
    // Altbestand kannte nur "Sonstiger…" als Freitext-Feld.
    expect(datentypQuelleOf({ datentyp: 'Code.GDS.Neu' })).toBe('frei');
  });

  it('meldet beim Container gar keine Herkunft', () => {
    expect(datentypQuelleOf({})).toBeNull();
    expect(datentypQuelleOf({ datentyp: '' })).toBeNull();
  });
});

describe('datentypAnzeige', () => {
  it('setzt das xs:-Praefix nur bei Basistypen', () => {
    // Akzeptanz: Altprofil ohne Herkunft steht unveraendert als xs:string da.
    expect(datentypAnzeige({ datentyp: 'string' })).toBe('xs:string');
    expect(datentypAnzeige({ datentyp: 'Type.GDS.Akte', datentypQuelle: 'schema' })).toBe(
      'Type.GDS.Akte',
    );
    expect(datentypAnzeige({ datentyp: 'datatypeC', datentypQuelle: 'schema' })).toBe('datatypeC');
    expect(datentypAnzeige({ datentyp: 'MeinTyp', datentypQuelle: 'frei' })).toBe('MeinTyp');
  });

  it('benennt den Container', () => {
    expect(datentypAnzeige({})).toBe('Container (enthält Unterelemente)');
  });
});

describe('datentypUnbekannt — die gelbe Markierung', () => {
  const katalog = datentypGruppen(testIndex());

  it('markiert einen Freitext-Typ, den das Schema nicht kennt', () => {
    expect(datentypUnbekannt({ datentyp: 'Code.GDS.Neu', datentypQuelle: 'frei' }, katalog)).toBe(
      true,
    );
  });

  it('laesst gewaehlte Typen in Ruhe', () => {
    expect(datentypUnbekannt({ datentyp: 'string' }, katalog)).toBe(false);
    expect(
      datentypUnbekannt({ datentyp: 'Type.GDS.Akte', datentypQuelle: 'schema' }, katalog),
    ).toBe(false);
    expect(datentypUnbekannt({}, katalog)).toBe(false);
  });

  it('laesst einen Altbestands-Typ in Ruhe, den das Schema kennt', () => {
    // Ohne Herkunft gilt er als Freitext — im Katalog steht er trotzdem.
    expect(datentypUnbekannt({ datentyp: 'Type.GDS.Akte' }, katalog)).toBe(false);
  });
});
