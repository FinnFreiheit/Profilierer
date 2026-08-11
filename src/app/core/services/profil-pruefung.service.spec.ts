import { TestBed } from '@angular/core/testing';
import { ProfilPruefungService } from './profil-pruefung.service';
import { SchemaIndexService } from './schema-index.service';
import { ProfileStoreService } from './profile-store.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { XmlValidationService, XmlValidierung } from './xml-validation.service';
import { XsdParserService } from './xsd-parser.service';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';
import { AuspBezeichnungen, TestmessageEntry } from '../../models/testmessage.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
    <xs:element name="art" type="xs:string" minOccurs="0"/>
    <xs:element name="beteiligung" type="Type.Test.Bet" minOccurs="0" maxOccurs="unbounded"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Bet"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0001';

const INSTANCE = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.test.0001 xmlns="http://www.xjustiz.de">
  <az>4 O 12/25</az>
  <art>007</art>
  <beteiligung><name>A</name></beteiligung>
  <beteiligung><name>B</name></beteiligung>
</nachricht.test.0001>`;

/**
 * Der Pruefdienst gegen echte Bausteine (Import, Abgleich, Zuordnung); nur die
 * Ablagen und die Schemavalidierung sind gestellt.
 */
describe('ProfilPruefungService', () => {
  let svc: ProfilPruefungService;
  let xml: string | null;
  let bezeichnungen: AuspBezeichnungen | null;
  let profilDoc: ProfileDoc;
  let schemaPruefung: XmlValidierung;

  const V = { pflicht: 'w1', excl: 'w3' };

  const doc = (teile: Partial<ProfileDoc> = {}): ProfileDoc => ({
    meta: { name: 'Testprofil', nachricht: M, xjustizVersion: '3.6.2' },
    statuses: [
      { id: V.pflicht, name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' },
      { id: V.excl, name: 'nicht verwendet', farbe: '#888', wirkung: 'ausgeschlossen' },
    ],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
    ...teile,
  });

  const eintrag = (teile: Partial<TestmessageEntry> = {}): TestmessageEntry => ({
    id: 't1',
    name: 'lieferung.xml',
    nachricht: M,
    xjustizVersion: '3.6.2',
    groesse: 100,
    hochgeladen: 0,
    aktualisiert: 0,
    ...teile,
  });

  const profil = (teile: Partial<LibraryEntry> = {}): LibraryEntry => ({
    id: 'p1',
    name: 'Testprofil',
    nachricht: M,
    xjustizVersion: '3.6.2',
    nStatus: 0,
    nAusp: 0,
    aktualisiert: 0,
    ...teile,
  });

  beforeEach(() => {
    xml = INSTANCE;
    bezeichnungen = null;
    profilDoc = doc();
    schemaPruefung = { status: 'valide', fehler: [], fehlerDetails: [] };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TestmessageStoreService,
          useValue: {
            loadXml: async () => xml,
            loadBezeichnungen: async () => bezeichnungen,
          },
        },
        { provide: ProfileStoreService, useValue: { load: async () => profilDoc } },
        { provide: XmlValidationService, useValue: { validiere: async () => schemaPruefung } },
      ],
    });
    const parser = TestBed.inject(XsdParserService);
    const idx = parser.buildIndexFrom([
      {
        file: 'xjustiz_0000_test.xsd',
        dom: new DOMParser().parseFromString(XSD, 'application/xml'),
      },
    ]).idx;
    TestBed.inject(SchemaIndexService).fuerVersion = async () => idx;
    svc = TestBed.inject(ProfilPruefungService);
  });

  describe('passt (Zulassung im Picker)', () => {
    it('verlangt denselben Nachrichtentyp — sonst teilen beide keinen Pfad', () => {
      expect(svc.passt(eintrag(), profil())).toBeTrue();
      expect(svc.passt(eintrag(), profil({ nachricht: 'nachricht.test.9999' }))).toBeFalse();
      expect(svc.passt(eintrag(), profil({ nachricht: undefined }))).toBeFalse();
    });

    it('verlangt dieselbe Version — eine fehlende Angabe passt zu allem', () => {
      expect(svc.passt(eintrag(), profil({ xjustizVersion: '4.0.0' }))).toBeFalse();
      expect(svc.passt(eintrag({ xjustizVersion: undefined }), profil())).toBeTrue();
      expect(svc.passt(eintrag(), profil({ xjustizVersion: undefined }))).toBeTrue();
    });
  });

  it('meldet Verstoesse und Luecken getrennt', async () => {
    profilDoc = doc({
      elemente: {
        [`${M}/az`]: { status: V.pflicht },
        [`${M}/art`]: { werte: ['001', '002'] }, // 007 ist nicht freigegeben
      },
    });

    const b = await svc.pruefe(eintrag(), profil(), null);

    expect(b.verstoesse.map((v) => v.art)).toEqual(['wert']);
    // Die Beteiligten-Namen sind belegt, ohne dass das Profil etwas dazu sagt.
    expect(b.luecken.map((l) => l.pfad.replace(/@[^/]+/g, '@#'))).toEqual([
      `${M}/beteiligung@#/name`,
      `${M}/beteiligung@#/name`,
    ]);
    expect(b.kopf.profilName).toBe('Testprofil');
    expect(b.kopf.fassung).toBe('Arbeitsstand');
  });

  it('meldet ein fehlendes Pflicht-Blatt ueber die Anwesenheit der Nachricht', async () => {
    // `az` fehlt in dieser Nachricht — additiv gelesen ist es nicht enthalten.
    xml = INSTANCE.replace('<az>4 O 12/25</az>\n  ', '');
    profilDoc = doc({ elemente: { [`${M}/az`]: { status: V.pflicht } } });

    const b = await svc.pruefe(eintrag(), profil(), null);

    expect(b.verstoesse.map((v) => v.art)).toEqual(['pflichtwert']);
    expect(b.verstoesse[0]!.pfad).toBe(`${M}/az`);
  });

  it('meldet ein zwingendes benanntes Vorkommen nur, wenn es zuordenbar ist', async () => {
    profilDoc = doc({
      elemente: { [`${M}/beteiligung@n1`]: { status: V.pflicht } },
      auspraegungen: {
        [`${M}/beteiligung`]: [
          { id: 'n1', name: 'Antragsteller' },
          { id: 'n2', name: 'Antragsgegner' },
        ],
      },
    });

    // Ohne Bezeichnungen: keine Zuordnung moeglich, also kein Befund — sonst
    // meldete jede hochgeladene Nachricht jedes benannte Vorkommen als fehlend.
    const ohne = await svc.pruefe(eintrag(), profil(), null);
    expect(ohne.verstoesse.filter((v) => v.art === 'vorkommen')).toEqual([]);
    expect(ohne.kopf.vorkommenUnzuordenbar).toBeTrue();

    // Mit Bezeichnungen, die das zwingende Vorkommen **nicht** enthalten:
    // jetzt ist die Liste zuordenbar und das Fehlen ein echter Befund.
    bezeichnungen = { [`${M}/beteiligung`]: ['Antragsgegner', 'Zeuge/Zeugin'] };
    const mit = await svc.pruefe(eintrag(), profil(), null);
    const v = mit.verstoesse.filter((x) => x.art === 'vorkommen');
    expect(v.length).toBe(1);
    expect(v[0]!.text).toContain('Antragsteller');
    expect(mit.kopf.vorkommenUnzuordenbar).toBeFalse();
  });

  it('prueft eine schema-invalide Nachricht weiter, nennt das Urteil aber im Kopf', async () => {
    schemaPruefung = {
      status: 'invalide',
      fehler: ['Zeile 3: unerwartetes Element'],
      fehlerDetails: [],
    };

    const b = await svc.pruefe(eintrag(), profil(), null);

    expect(b.kopf.schema).toBe('invalide');
    expect(b.kopf.schemaFehler).toEqual(['Zeile 3: unerwartetes Element']);
  });

  it('bricht ab, wenn zur Version kein Schema hinterlegt ist', async () => {
    TestBed.inject(SchemaIndexService).fuerVersion = async () => null;

    await expectAsync(svc.pruefe(eintrag(), profil(), null)).toBeRejectedWithError(/nicht prüfbar/);
  });

  it('bricht ab, wenn die Nachricht nicht ladbar ist', async () => {
    xml = null;
    await expectAsync(svc.pruefe(eintrag(), profil(), null)).toBeRejectedWithError(
      /nicht gefunden/,
    );
  });
});
