import { TestBed } from '@angular/core/testing';
import { TestmessageCreateService } from './testmessage-create.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { TestmessageGenerationService } from './testmessage-generation.service';
import { PersistenceService } from './persistence.service';
import { ToastService } from './toast.service';
import { XmlValidationService, XmlValidierung } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { StateService } from './state.service';
import { GuidedService } from './guided.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';
import { GuidedMessageState, TestmessageInput } from '../../models/testmessage.model';

/**
 * Fixture: Pflicht-Blatt (kopf), optionales Blatt (az) und ein wiederholbares
 * Pflicht-Element mit minOccurs=2 (anlage) fuer die Mindest-Vorkommen-Regel.
 */
const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
    <xs:element name="anlage" type="Type.Test.Anlage" minOccurs="2" maxOccurs="unbounded"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Anlage"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

const M = 'nachricht.test.0001';

describe('TestmessageCreateService', () => {
  let svc: TestmessageCreateService;
  let state: StateService;
  let guided: GuidedService;
  let created: TestmessageInput[];
  let patched: { id: string; patch: Record<string, unknown> }[];
  let entscheidungen: GuidedMessageState | null;
  /** Stub-Ergebnis der Schemavalidierung; Tests schalten um. */
  let pruefung: XmlValidierung;

  beforeEach(() => {
    created = [];
    patched = [];
    entscheidungen = null;
    pruefung = { status: 'valide', fehler: [], fehlerDetails: [] };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TestmessageStoreService,
          useValue: {
            create: async (input: TestmessageInput) => {
              created.push(input);
              return 'id-neu';
            },
            updateMeta: async (id: string, patch: Record<string, unknown>) => {
              patched.push({ id, patch });
            },
            loadEntscheidungen: async () => entscheidungen,
          },
        },
        { provide: TestmessageGenerationService, useValue: { ensureSchema: async () => {} } },
        { provide: PersistenceService, useValue: { flushAutosave: async () => {} } },
        { provide: ToastService, useValue: { show: () => {} } },
        { provide: XmlValidationService, useValue: { validiere: async () => pruefung } },
      ],
    });
    svc = TestBed.inject(TestmessageCreateService);
    state = TestBed.inject(StateService);
    guided = TestBed.inject(GuidedService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    state.idx.set(parser.buildIndexFrom(docs).idx);
    state.version.set('3.6.2');
  });

  describe('neuErstellen', () => {
    it('startet die Sitzung: leerer Baum, Fuehrung an, Editor-Ansicht', async () => {
      await svc.neuErstellen('3.6.2', M);
      expect(state.msgName()).toBe(M);
      expect(state.messageCreate()).toEqual(
        jasmine.objectContaining({ msgName: M, entryId: null }),
      );
      expect(state.guided()).toBeTrue();
      expect(state.view()).toBe('editor');
      // Keine Vorbelegung von Werten.
      expect(Object.values(state.elemente()).some((p) => p.beispiel)).toBeFalse();
    });

    it('legt Mindest-Vorkommen (minOccurs=2) als Auspraegungen an', async () => {
      await svc.neuErstellen('3.6.2', M);
      expect(state.auspsOf(`${M}/anlage`)?.length).toBe(2);
    });

    it('wirft bei unbekannter Nachricht', async () => {
      await expectAsync(svc.neuErstellen('3.6.2', 'nachricht.gibtsnicht')).toBeRejected();
    });
  });

  describe('speichern', () => {
    beforeEach(async () => {
      await svc.neuErstellen('3.6.2', M);
    });

    it('legt beim ersten Mal einen Entwurfs-Eintrag an und merkt sich die id', async () => {
      spyOn(window, 'prompt').and.returnValue('Meine Testnachricht.xml');
      expect(await svc.speichern()).toBeTrue();
      expect(created.length).toBe(1);
      const input = created[0]!;
      expect(input.name).toBe('Meine Testnachricht.xml');
      expect(input.nachricht).toBe(M);
      expect(input.entwurf).toBeTrue(); // Pflichtwerte offen
      expect(input.fortschritt!.y).toBeGreaterThan(0);
      expect(input.entscheidungen!.msgName).toBe(M);
      expect(state.messageCreate()!.entryId).toBe('id-neu');
    });

    it('aktualisiert danach denselben Eintrag (kein zweiter Neu-Eintrag)', async () => {
      spyOn(window, 'prompt').and.returnValue('X.xml');
      await svc.speichern();
      await svc.speichern();
      expect(created.length).toBe(1);
      expect(patched.length).toBe(1);
      expect(patched[0]!.id).toBe('id-neu');
    });

    it('vollstaendig = kein Entwurf; offene optionale Entscheidungen fragen nach', async () => {
      spyOn(window, 'prompt').and.returnValue('X.xml');
      guided.fuellePflichtfelder(); // kopf + 2x anlage/name
      const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
      await svc.speichern();
      expect(confirmSpy).toHaveBeenCalled(); // az (optional) ist noch offen
      expect(created[0]!.entwurf).toBeFalse();
    });

    it('vollstaendig, aber nicht schema-valide -> bleibt Entwurf', async () => {
      pruefung = {
        status: 'invalide',
        fehler: ['Zeile 2: kopf fehlt'],
        fehlerDetails: [{ text: 'Zeile 2: kopf fehlt', zeile: 2 }],
      };
      spyOn(window, 'prompt').and.returnValue('X.xml');
      guided.fuellePflichtfelder();
      spyOn(window, 'confirm').and.returnValue(true);
      await svc.speichern();
      expect(created[0]!.entwurf).toBeTrue();
    });

    it('invalides Speichern markiert die Fehler im Baum und liefert klickbare Eintraege', async () => {
      // Zeile 3 ist das kopf-Blatt (Instanz-Modus: Deklaration + Root-Open davor).
      pruefung = {
        status: 'invalide',
        fehler: ['Zeile 3: kopf falsch belegt'],
        fehlerDetails: [{ text: 'Zeile 3: kopf falsch belegt', zeile: 3 }],
      };
      spyOn(window, 'prompt').and.returnValue('X.xml');
      guided.fuellePflichtfelder();
      spyOn(window, 'confirm').and.returnValue(true);
      await svc.speichern();
      const report = TestBed.inject(ValidationReportService);
      expect(report.offen()).toBeTrue();
      expect(report.eintraege()[0]!.pfad).toBe(`${M}/kopf`);
      expect(state.valFehler()?.get(`${M}/kopf`)).toEqual(['Zeile 3: kopf falsch belegt']);
      expect(state.valAnc()?.get(M)).toBe(1);
    });

    it('nur Erweiterungs-Fehler machen keinen Entwurf (bekannte Schema-Erweiterung)', async () => {
      state.addErweiterung(M, { name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' });
      pruefung = {
        status: 'invalide',
        fehler: ['nicht erwartet'],
        fehlerDetails: [{ text: "Element 'zusatzAngabe': This element is not expected.", zeile: 3 }],
      };
      spyOn(window, 'prompt').and.returnValue('X.xml');
      guided.fuellePflichtfelder();
      spyOn(window, 'confirm').and.returnValue(true);
      await svc.speichern();
      expect(created[0]!.entwurf).toBeFalse();
      // Kein blockierender Bericht, keine roten Baum-Marker.
      expect(TestBed.inject(ValidationReportService).offen()).toBeFalse();
      expect(state.valFehler()).toBeNull();
    });

    it('abgebrochene Namensabfrage speichert nicht', async () => {
      spyOn(window, 'prompt').and.returnValue(null);
      expect(await svc.speichern()).toBeFalse();
      expect(created.length).toBe(0);
      expect(state.messageCreate()!.entryId).toBeNull();
    });
  });

  describe('fortsetzen', () => {
    it('stellt Entscheidungsstand, Sitzung und Fuehrung wieder her', async () => {
      entscheidungen = {
        msgName: M,
        xjustizVersion: '3.6.2',
        profil: {
          meta: {},
          statuses: state.statuses(),
          elemente: { [`${M}/kopf`]: { beispiel: 'Az 1' } },
          auspraegungen: {},
          erweiterungen: {},
        },
      };
      await svc.fortsetzen({
        id: 'id-alt', name: 'Entwurf.xml', groesse: 1, hochgeladen: 0, aktualisiert: 0,
      });
      expect(state.msgName()).toBe(M);
      expect(state.elemente()[`${M}/kopf`]?.beispiel).toBe('Az 1');
      expect(state.messageCreate()).toEqual(
        jasmine.objectContaining({ entryId: 'id-alt', name: 'Entwurf.xml' }),
      );
      expect(state.guided()).toBeTrue();
      expect(guided.wertOk(`${M}/kopf`)).toBeTrue();
    });

    it('wirft ohne gespeicherten Entscheidungsstand', async () => {
      entscheidungen = null;
      await expectAsync(
        svc.fortsetzen({ id: 'x', name: 'y', groesse: 1, hochgeladen: 0, aktualisiert: 0 }),
      ).toBeRejected();
    });
  });
});
