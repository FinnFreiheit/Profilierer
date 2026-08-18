import { TestBed } from '@angular/core/testing';
import { SitzungsAbgleichService } from './konformitaet.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { NavService } from './nav.service';
import { ProfileDoc } from '../../models/profile.model';

/**
 * Der Sitzungs-Adapter mit **echtem Baum** — hier faellt die Auskunft
 * `istEnthalten`, die der zustandslose Abgleich in seinen eigenen Tests nur
 * simuliert.
 */
const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0009" type="Type.T9.Root"/>
  <xs:complexType name="Type.T9.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
    <xs:element name="auswahl.kontakt" type="Type.T9.Auswahl"/>
    <xs:element name="kontakt" type="Type.T9.Kontakt" minOccurs="0"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.T9.Auswahl"><xs:choice>
    <xs:element name="postfach" type="Type.T9.Postfach"/>
    <xs:element name="email" type="Type.T9.Email"/>
  </xs:choice></xs:complexType>
  <xs:complexType name="Type.T9.Postfach"><xs:sequence>
    <xs:element name="nummer" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.T9.Email"><xs:sequence>
    <xs:element name="adresse" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.T9.Kontakt"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0009';
const V = { pflicht: 'w1', optional: 'w2', excl: 'w3' };
/** Stufen-ids der **Sitzung** (Standardstufen, `defaultStatuses`). */
const S = { pflicht: 's1', excl: 's3' };

const vorgabe = (teile: Partial<ProfileDoc> = {}): ProfileDoc => ({
  meta: {},
  statuses: [
    { id: V.pflicht, name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' },
    { id: V.optional, name: 'anzugeben, wenn vorhanden', farbe: '#0a0', wirkung: 'optional' },
    { id: V.excl, name: 'nicht verwendet', farbe: '#888', wirkung: 'ausgeschlossen' },
  ],
  elemente: {},
  auspraegungen: {},
  erweiterungen: {},
  ...teile,
});

describe('SitzungsAbgleichService (echter Baum)', () => {
  let svc: SitzungsAbgleichService;
  let state: StateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(SitzungsAbgleichService);
    state = TestBed.inject(StateService);
    const parser = TestBed.inject(XsdParserService);
    const nav = TestBed.inject(NavService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test9.xsd', dom }]).idx;
    state.idx.set(idx);
    nav.loadMessage(M);
  });

  /** Die Vorgabe setzt in **beiden** Zweigen der Auswahl einen Wert zwingend. */
  const vorgabeMitAuswahl = (): void =>
    state.setVorgabe(
      vorgabe({
        elemente: {
          [`${M}/auswahl.kontakt/postfach/nummer`]: { status: V.pflicht },
          [`${M}/auswahl.kontakt/email/adresse`]: { status: V.pflicht },
        },
      }),
    );

  it('verlangt nichts im nicht gewaehlten Zweig einer Auswahl', () => {
    // In einer Auswahl kann nur ein Zweig vorkommen — der andere fehlt
    // notwendig. Gemeldet wurde er trotzdem: ein Zweig traegt im Schema
    // `minOccurs="1"`, und die eine Regel las das als „enthalten".
    vorgabeMitAuswahl();
    // Gewaehlt: E-Mail (ausdruecklich, wie es die Fuehrung setzt), belegt.
    state.setElementProfile(`${M}/auswahl.kontakt/email`, { status: S.pflicht });
    state.setElementProfile(`${M}/auswahl.kontakt/postfach`, { status: S.excl });
    state.setElementProfile(`${M}/auswahl.kontakt/email/adresse`, { beispiel: 'a@b.de' });

    expect(svc.pruefe().map((v) => `${v.art} ${v.pfad}`)).toEqual([]);
  });

  it('verlangt nichts in einer Auswahl, die der Durchlauf uebergangen hat', () => {
    // Ohne Wahl steht kein Zweig in der Nachricht — auch nicht der erste. Dass
    // die Auswahl offen ist, meldet der Durchlauf als offenen Pflichtpunkt,
    // nicht der Konformitaets-Abgleich als fehlende Werte.
    vorgabeMitAuswahl();

    expect(svc.pruefe().map((v) => `${v.art} ${v.pfad}`)).toEqual([]);
  });

  it('verlangt den Wert im gewaehlten Zweig weiterhin', () => {
    // Die Gegenprobe: der gewaehlte Zweig ist betreten, dort greift die
    // zwingende Festlegung der Profilierung unveraendert.
    vorgabeMitAuswahl();
    state.setElementProfile(`${M}/auswahl.kontakt/email`, { status: S.pflicht });

    expect(svc.pruefe().map((v) => `${v.art} ${v.pfad}`)).toEqual([
      `pflichtwert ${M}/auswahl.kontakt/email/adresse`,
    ]);
  });

  it('verlangt nichts unter einem uebergangenen optionalen Element', () => {
    state.setVorgabe(
      vorgabe({
        elemente: {
          [`${M}/kontakt`]: { status: V.optional },
          [`${M}/kontakt/name`]: { status: V.pflicht },
        },
      }),
    );

    expect(svc.pruefe().map((v) => `${v.art} ${v.pfad}`)).toEqual([]);
  });
});
