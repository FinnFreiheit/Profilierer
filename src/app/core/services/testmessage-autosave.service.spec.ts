import { TestBed } from '@angular/core/testing';
import { TestmessageAutosaveService } from './testmessage-autosave.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { InstanceImportService } from './instance-import.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';
import { MessageCreateSession, TestmessageInput } from '../../models/testmessage.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="nachrichtenkopf" type="Type.Test.Kopf"/>
    <xs:element name="vorname" type="xs:string"/>
    <xs:element name="spitzname" type="xs:string" minOccurs="0"/>
    <xs:element name="beteiligter" minOccurs="0" maxOccurs="unbounded"><xs:complexType><xs:sequence>
      <xs:element name="rolle" type="xs:string"/>
    </xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Kopf"><xs:sequence>
    <xs:element name="erstellungszeitpunkt" type="xs:dateTime"/>
    <xs:element name="absender"><xs:complexType><xs:sequence>
      <xs:element name="eigeneNachrichtenID" type="xs:string"/>
    </xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const INSTANCE = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht.test.0001 xmlns="http://www.xjustiz.de">
  <nachrichtenkopf>
    <erstellungszeitpunkt>2020-01-01T00:00:00</erstellungszeitpunkt>
    <absender><eigeneNachrichtenID>ALT-ID-123</eigeneNachrichtenID></absender>
  </nachrichtenkopf>
  <vorname>Max</vorname>
  <beteiligter><rolle>Antragsteller</rolle></beteiligter>
  <beteiligter><rolle>Antragsgegner</rolle></beteiligter>
</nachricht.test.0001>`;

const M = 'nachricht.test.0001';
/** Entprellung des Dienstes (2 s) mit Reserve. */
const NACH_ENTPRELLUNG = 2100;

describe('TestmessageAutosaveService (#105)', () => {
  let svc: TestmessageAutosaveService;
  let state: StateService;
  let importer: InstanceImportService;
  let created: TestmessageInput[];
  let patched: { id: string; patch: Record<string, unknown> }[];
  /** Backend-Stub schlaegt fehl (Ausfall simulieren). */
  let backendTot: boolean;

  /** Entprellung ablaufen lassen und den ausgeloesten Schreibvorgang abwarten. */
  async function entprellen(): Promise<void> {
    TestBed.tick(); // Effekt ausfuehren -> Timer planen
    jasmine.clock().tick(NACH_ENTPRELLUNG);
    await svc.flush();
  }

  /** Eine gespeicherte Nachricht zur Bearbeitung oeffnen (ohne den EditService). */
  function bearbeitungOeffnen(entryId: string | null = 'id-1'): void {
    importer.importXml(INSTANCE, 'quelle.xml');
    state.messageEdit.update((s) => (s ? { ...s, entryId } : s));
    svc.sitzungBeginnt();
  }

  beforeEach(() => {
    created = [];
    patched = [];
    backendTot = false;
    localStorage.clear();
    jasmine.clock().install();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => [],
            create: async (input: TestmessageInput) => {
              if (backendTot) throw new Error('Backend weg');
              created.push(input);
              return 'id-neu';
            },
            updateMeta: async (id: string, patch: Record<string, unknown>) => {
              if (backendTot) throw new Error('Backend weg');
              patched.push({ id, patch });
            },
          },
        },
        { provide: ToastService, useValue: { show: () => {} } },
      ],
    });
    svc = TestBed.inject(TestmessageAutosaveService);
    state = TestBed.inject(StateService);
    importer = TestBed.inject(InstanceImportService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    state.idx.set(parser.buildIndexFrom(docs).idx);
    state.version.set('3.6.2');
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  describe('Bearbeitung einer gespeicherten Nachricht', () => {
    it('sichert eine Aenderung nach der Entprellung in denselben Eintrag', async () => {
      bearbeitungOeffnen();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });

      await entprellen();

      expect(patched.length).toBe(1);
      expect(patched[0]!.id).toBe('id-1');
      expect(patched[0]!.patch['xml'] as string).toContain('<vorname>Erika</vorname>');
      // Kopfdaten unangetastet: es ist dieselbe Nachricht.
      expect(patched[0]!.patch['xml'] as string).toContain('ALT-ID-123');
    });

    // Ohne diese Marke schoebe schon das blosse Oeffnen den Eintrag in der
    // Uebersicht nach oben ("zuletzt geaendert"), ohne dass jemand etwas tat.
    it('das blosse Oeffnen loest keinen Speichervorgang aus', async () => {
      bearbeitungOeffnen();

      await entprellen();

      expect(patched.length).toBe(0);
    });

    it('das Entwurfs-Kennzeichen bleibt dem bewussten Speichern vorbehalten', async () => {
      bearbeitungOeffnen();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });

      await entprellen();

      expect(patched[0]!.patch['entwurf']).toBeUndefined();
    });

    it('vergebene Namen der Vorkommen gehen mit', async () => {
      bearbeitungOeffnen();
      const liste = `${M}/beteiligter`;
      state.renameAusp(liste, state.auspsOf(liste)![0]!.id, 'Kläger');

      await entprellen();

      expect(patched[0]!.patch['bezeichnungen']).toEqual({ [liste]: ['Kläger', 'Vorkommen 2'] });
    });

    // Datei-Upload/Drag&Drop: es gibt keinen Eintrag, in den geschrieben werden
    // koennte — und (anders als im Durchlauf) auch keinen Namen dafuer.
    it('ohne Testspeicher-Eintrag wird nichts gesichert', async () => {
      bearbeitungOeffnen(null);
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });

      await entprellen();

      expect(patched.length).toBe(0);
      expect(created.length).toBe(0);
    });

    it('bei Abnahme-Schreibschutz wird nichts gesichert', async () => {
      bearbeitungOeffnen();
      state.abnahmeSchreibschutz.set(true);
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });

      await entprellen();

      expect(patched.length).toBe(0);
    });

    it('mehrere Aenderungen in Folge ergeben einen Schreibvorgang', async () => {
      bearbeitungOeffnen();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'A' });
      TestBed.tick();
      jasmine.clock().tick(500);
      state.setElementProfile(`${M}/vorname`, { beispiel: 'B' });

      await entprellen();

      expect(patched.length).toBe(1);
      expect(patched[0]!.patch['xml'] as string).toContain('<vorname>B</vorname>');
    });

    it('nach dem Sichern ist ohne neue Aenderung nichts mehr faellig', async () => {
      bearbeitungOeffnen();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });
      await entprellen();

      await entprellen();

      expect(patched.length).toBe(1);
      expect(svc.ungesichert()).toBeFalse();
    });

    it('explizit gespeichert: der Autosave holt nicht nach', async () => {
      bearbeitungOeffnen();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });
      svc.explizitGespeichert();

      await entprellen();

      expect(patched.length).toBe(0);
    });
  });

  describe('gefuehrter Durchlauf', () => {
    /** Sitzung wie TestmessageCreateService.neuErstellen, ohne dessen Fuehrung. */
    function durchlaufStarten(session: Partial<MessageCreateSession> = {}): void {
      TestBed.inject(NavService).loadMessage(M); // leerer Baum, keine Instanz
      state.messageCreate.set({
        msgName: M,
        xjustizVersion: '3.6.2',
        entryId: null,
        name: null,
        ...session,
      });
      svc.sitzungBeginnt();
    }

    it('legt den Eintrag bei der ersten Aenderung selbst an', async () => {
      durchlaufStarten();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });

      await entprellen();

      expect(created.length).toBe(1);
      expect(created[0]!.name).toBe(`${M} — Testnachricht.xml`);
      // Ein ungefragt angelegter Eintrag ist per Definition unfertig.
      expect(created[0]!.entwurf).toBeTrue();
      // Fortsetzbar bleiben: ohne Entscheidungsstand faende "Entwurf fortsetzen"
      // nach einem Absturz nichts vor.
      expect(created[0]!.entscheidungen).toBeTruthy();
      expect(state.messageCreate()!.entryId).toBe('id-neu');
      // Der Name bleibt offen — ihn fragt das erste bewusste Speichern nach.
      expect(state.messageCreate()!.name).toBeNull();
    });

    it('die Profil-Bindung geht mit (spaeter nicht mehr setzbar)', async () => {
      durchlaufStarten({ profilId: 'p1', profilName: 'P', fassung: 'v3' });
      // Nach loadMessage: jeder Profil-Einstieg raeumt die Vorgabe.
      state.setVorgabe({
        meta: { name: 'P' },
        statuses: [],
        elemente: {},
        auspraegungen: {},
        erweiterungen: {},
      });
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });

      await entprellen();

      expect(created[0]!.profilId).toBe('p1');
      expect(created[0]!.fassung).toBe('v3');
      expect(created[0]!.vorgabe).toBeTruthy();
    });

    it('legt nur einmal an und aktualisiert danach denselben Eintrag', async () => {
      durchlaufStarten();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });
      await entprellen();

      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika II' });
      await entprellen();

      expect(created.length).toBe(1);
      expect(patched.length).toBe(1);
      expect(patched[0]!.id).toBe('id-neu');
    });

    it('ein abgebrochener Durchlauf ohne Aenderung legt nichts an', async () => {
      durchlaufStarten();

      await entprellen();

      expect(created.length).toBe(0);
    });
  });

  describe('Backend-Ausfall', () => {
    it('haelt eine Notfallkopie im localStorage und warnt in der Fusszeile', async () => {
      bearbeitungOeffnen();
      backendTot = true;
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });

      await entprellen();

      const key = Object.keys(localStorage).find((k) => k.startsWith('xjp.notfall-nachricht.'));
      expect(key).toBeDefined();
      expect(JSON.parse(localStorage.getItem(key!)!).id).toBe('id-1');
      expect(state.autosaveInfo()).toContain('NICHT im Backend gesichert');
      expect(svc.ungesichert()).toBeTrue();
    });

    // Der Prefix darf nicht unter dem des Profil-Autosave liegen: dessen
    // Nachtrag scannt `xjp.notfall.` und lese jeden Treffer als Profil.
    it('der Prefix kollidiert nicht mit dem der Profil-Notfallkopien', async () => {
      bearbeitungOeffnen();
      backendTot = true;
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });
      await entprellen();

      const key = Object.keys(localStorage).find((k) => k.startsWith('xjp.notfall-nachricht.'))!;
      expect(key.startsWith('xjp.notfall.')).toBeFalse();
    });

    it('traegt die Kopie nach, sobald das Backend wieder antwortet', async () => {
      bearbeitungOeffnen();
      backendTot = true;
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });
      await entprellen();

      backendTot = false;
      jasmine.clock().tick(5100); // Wiederholung
      await svc.flush();

      expect(patched.length).toBe(1);
      expect(
        Object.keys(localStorage).some((k) => k.startsWith('xjp.notfall-nachricht.')),
      ).toBeFalse();
      expect(state.autosaveInfo()).toContain('automatisch gesichert');
    });

    it('nachtragen beim Start raeumt liegengebliebene Kopien', async () => {
      localStorage.setItem(
        'xjp.notfall-nachricht.id-alt',
        JSON.stringify({ id: 'id-alt', patch: { xml: '<x/>' }, ts: 0 }),
      );

      await svc.flushNotfallkopien();

      expect(patched).toEqual([{ id: 'id-alt', patch: { xml: '<x/>' } }]);
      expect(localStorage.getItem('xjp.notfall-nachricht.id-alt')).toBeNull();
    });
  });

  describe('flush beim Sitzungswechsel', () => {
    it('schreibt den ausstehenden Stand sofort in den bisherigen Eintrag', async () => {
      bearbeitungOeffnen();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });
      TestBed.tick(); // Timer planen, aber nicht ablaufen lassen

      await svc.flush();

      expect(patched.length).toBe(1);
      expect(patched[0]!.id).toBe('id-1');
      expect(svc.ungesichert()).toBeFalse();
    });

    // Der Wechsel kann so dicht auf die Aenderung folgen, dass der Effekt noch
    // gar nicht lief — dann gibt es keinen Timer, wohl aber etwas zu sichern.
    it('sichert auch, wenn der Effekt noch keinen Timer geplant hat', async () => {
      bearbeitungOeffnen();
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });

      await svc.flush();

      expect(patched.length).toBe(1);
    });

    it('ohne Aenderung schreibt der Wechsel nichts', async () => {
      bearbeitungOeffnen();

      await svc.flush();

      expect(patched.length).toBe(0);
    });
  });
});
