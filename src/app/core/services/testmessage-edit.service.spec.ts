import { TestBed } from '@angular/core/testing';
import { TestmessageEditService } from './testmessage-edit.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { TestmessageGenerationService } from './testmessage-generation.service';
import { PersistenceService } from './persistence.service';
import { RolleService } from './rolle.service';
import { ToastService } from './toast.service';
import { CodelistService } from './codelist.service';
import { XmlValidationService, XmlValidierung } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';
import { TestmessageEntry, TestmessageInput } from '../../models/testmessage.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="nachrichtenkopf" type="Type.Test.Kopf"/>
    <xs:element name="vorname" type="xs:string"/>
    <xs:element name="spitzname" type="xs:string" minOccurs="0"/>
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
</nachricht.test.0001>`;

const M = 'nachricht.test.0001';

/** Minimaler Testspeicher-Eintrag; Tests ueberschreiben einzelne Felder. */
function eintrag(patch: Partial<TestmessageEntry> = {}): TestmessageEntry {
  return {
    id: 'id-1',
    name: 'quelle.xml',
    nachricht: M,
    fachmodul: 'test',
    xjustizVersion: '3.6.2',
    groesse: INSTANCE.length,
    hochgeladen: 0,
    aktualisiert: 0,
    ...patch,
  };
}

describe('TestmessageEditService', () => {
  let svc: TestmessageEditService;
  let state: StateService;
  let created: TestmessageInput[];
  let patched: { id: string; patch: Record<string, unknown> }[];
  let eintraege: TestmessageEntry[];
  /** Stub-Ergebnis der Schemavalidierung; Tests schalten um. */
  let pruefung: XmlValidierung;
  /** Rollen-Stub: AG-Schluessel aktiv? */
  let agAktiv: boolean;
  /** Antwort des Store-Stubs auf loadXml (null = Eintrag ohne XML). */
  let xmlAntwort: string | null;

  beforeEach(() => {
    created = [];
    patched = [];
    eintraege = [eintrag()];
    pruefung = { status: 'valide', fehler: [], fehlerDetails: [] };
    agAktiv = false;
    xmlAntwort = INSTANCE;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TestmessageStoreService,
          useValue: {
            entries: () => eintraege,
            loadXml: async () => xmlAntwort,
            create: async (input: TestmessageInput) => {
              created.push(input);
              return 'id-neu';
            },
            updateMeta: async (id: string, patch: Record<string, unknown>) => {
              patched.push({ id, patch });
            },
          },
        },
        { provide: TestmessageGenerationService, useValue: { ensureSchema: async () => {} } },
        { provide: PersistenceService, useValue: { flushAutosave: async () => {} } },
        { provide: RolleService, useValue: { agAktiv: () => agAktiv } },
        { provide: ToastService, useValue: { show: () => {} } },
        { provide: CodelistService, useValue: { ensureUsedCodelists: () => Promise.resolve() } },
        { provide: XmlValidationService, useValue: { validiere: async () => pruefung } },
      ],
    });
    svc = TestBed.inject(TestmessageEditService);
    state = TestBed.inject(StateService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const docs: XsdDoc[] = [{ file: 'xjustiz_0000_test.xsd', dom }];
    state.idx.set(parser.buildIndexFrom(docs).idx);
    state.version.set('3.6.2');
  });

  describe('oeffnen', () => {
    it('betrachten: gesperrte Ansicht mit nur Werten, id gemerkt', async () => {
      await svc.oeffnen(eintrag(), 'betrachten');
      expect(state.msgName()).toBe(M);
      expect(state.readOnly()).toBeTrue();
      expect(state.onlyValues()).toBeTrue();
      expect(state.messageEdit()!.entryId).toBe('id-1');
      expect(state.view()).toBe('editor');
    });

    it('bearbeiten: schaltet Sperre und Werte-Filter ab', async () => {
      await svc.oeffnen(eintrag(), 'bearbeiten');
      expect(state.readOnly()).toBeFalse();
      expect(state.onlyValues()).toBeFalse();
    });

    it('abgenommene Nachricht bleibt fuer Externe gesperrt', async () => {
      await svc.oeffnen(eintrag({ abgenommen: true }), 'bearbeiten');
      expect(state.abnahmeSchreibschutz()).toBeTrue();
      expect(state.readOnly()).toBeTrue();
    });

    it('mit AG-Schluessel ist auch eine abgenommene Nachricht bearbeitbar', async () => {
      agAktiv = true;
      await svc.oeffnen(eintrag({ abgenommen: true }), 'bearbeiten');
      expect(state.abnahmeSchreibschutz()).toBeFalse();
      expect(state.readOnly()).toBeFalse();
    });

    it('loest den Schreibschutz beim Oeffnen einer nicht abgenommenen Nachricht', async () => {
      await svc.oeffnen(eintrag({ abgenommen: true }), 'betrachten');
      await svc.oeffnen(eintrag({ id: 'id-2', abgenommen: false }), 'bearbeiten');
      expect(state.abnahmeSchreibschutz()).toBeFalse();
      expect(state.readOnly()).toBeFalse();
    });

    it('wirft, wenn zum Eintrag kein XML vorliegt', async () => {
      xmlAntwort = null;
      await expectAsync(svc.oeffnen(eintrag(), 'betrachten')).toBeRejected();
    });
  });

  describe('speichern (in denselben Eintrag)', () => {
    beforeEach(async () => {
      await svc.oeffnen(eintrag(), 'bearbeiten');
    });

    it('schreibt das geaenderte XML in denselben Eintrag, ohne neuen anzulegen', async () => {
      state.setElementProfile(`${M}/vorname`, { beispiel: 'Erika' });
      expect(await svc.speichern()).toBeTrue();
      expect(created.length).toBe(0);
      expect(patched.length).toBe(1);
      expect(patched[0]!.id).toBe('id-1');
      const xml = patched[0]!.patch['xml'] as string;
      expect(xml).toContain('<vorname>Erika</vorname>');
      // Kopfdaten bleiben: es ist dieselbe Nachricht, keine neue.
      expect(xml).toContain('ALT-ID-123');
      expect(patched[0]!.patch['entwurf']).toBeFalse();
    });

    it('ohne Testspeicher-Eintrag (Datei-Upload) wird nicht zurueckgeschrieben', async () => {
      state.messageEdit.update((s) => (s ? { ...s, entryId: null } : s));
      expect(await svc.speichern()).toBeFalse();
      expect(patched.length).toBe(0);
    });

    it('bei Abnahme-Schreibschutz wird nicht gespeichert', async () => {
      state.abnahmeSchreibschutz.set(true);
      expect(await svc.speichern()).toBeFalse();
      expect(patched.length).toBe(0);
    });

    it('invalide Nachricht: abgelehnte Rueckfrage speichert nicht, zeigt den Bericht', async () => {
      pruefung = { status: 'invalide', fehler: ['Zeile 2: falsch'], fehlerDetails: [] };
      spyOn(window, 'confirm').and.returnValue(false);
      expect(await svc.speichern()).toBeFalse();
      expect(patched.length).toBe(0);
      expect(TestBed.inject(ValidationReportService).offen()).toBeTrue();
    });

    it('invalide Nachricht: bestaetigte Rueckfrage speichert als Entwurf', async () => {
      pruefung = { status: 'invalide', fehler: ['Zeile 2: falsch'], fehlerDetails: [] };
      spyOn(window, 'confirm').and.returnValue(true);
      expect(await svc.speichern()).toBeTrue();
      expect(patched[0]!.patch['entwurf']).toBeTrue();
    });

    it('gefuehrt erstellter Eintrag fragt vor dem Ueberschreiben nach', async () => {
      eintraege = [eintrag({ gefuehrt: true })];
      const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
      expect(await svc.speichern()).toBeFalse();
      expect(confirmSpy).toHaveBeenCalled();
      expect(patched.length).toBe(0);
    });
  });

  describe('alsNeueSpeichern', () => {
    beforeEach(async () => {
      await svc.oeffnen(eintrag(), 'bearbeiten');
    });

    it('legt einen neuen Eintrag mit frischen Kopfdaten an', async () => {
      spyOn(window, 'prompt').and.returnValue('Kopie.xml');
      expect(await svc.alsNeueSpeichern()).toBeTrue();
      expect(patched.length).toBe(0);
      expect(created.length).toBe(1);
      expect(created[0]!.name).toBe('Kopie.xml');
      expect(created[0]!.nachricht).toBe(M);
      expect(created[0]!.xml).not.toContain('ALT-ID-123');
      expect(state.view()).toBe('testdaten');
    });

    it('schlaegt „<Quelle> (bearbeitet).xml" vor', async () => {
      const promptSpy = spyOn(window, 'prompt').and.returnValue(null);
      await svc.alsNeueSpeichern();
      expect(promptSpy).toHaveBeenCalledWith(jasmine.any(String), 'quelle (bearbeitet).xml');
    });

    it('speichert eine invalide Nachricht nicht (hartes Tor wie beim Upload)', async () => {
      pruefung = { status: 'invalide', fehler: ['Zeile 2: falsch'], fehlerDetails: [] };
      spyOn(window, 'prompt').and.returnValue('Kopie.xml');
      expect(await svc.alsNeueSpeichern()).toBeFalse();
      expect(created.length).toBe(0);
    });
  });
});
