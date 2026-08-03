import { TestBed } from '@angular/core/testing';
import { TestmessageCreateService } from './testmessage-create.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { TestmessageGenerationService } from './testmessage-generation.service';
import { ProfileStoreService, VersionMitDoc } from './profile-store.service';
import { PersistenceService } from './persistence.service';
import { ToastService } from './toast.service';
import { XmlValidationService, XmlValidierung } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { StateService } from './state.service';
import { GuidedService } from './guided.service';
import { XsdParserService } from './xsd-parser.service';
import { XsdDoc } from '../../models/xsd-index.model';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';
import { GuidedMessageState, TestmessageInput } from '../../models/testmessage.model';

/**
 * Fixture: Pflicht-Blatt (kopf), optionales Blatt (az), ein wiederholbares
 * Pflicht-Element mit minOccurs=2 (anlage) fuer die Mindest-Vorkommen-Regel und
 * ein schema-optionales wiederholbares Element (beteiligung), das die
 * Profilierung auf eine Mindestanzahl eingrenzen kann.
 */
const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="kopf" type="xs:string"/>
    <xs:element name="az" type="xs:string" minOccurs="0"/>
    <xs:element name="anlage" type="Type.Test.Anlage" minOccurs="2" maxOccurs="unbounded"/>
    <xs:element name="beteiligung" type="Type.Test.Bet" minOccurs="0" maxOccurs="unbounded"/>
    <xs:element name="extras" type="Type.Test.Extras" minOccurs="0"/>
  </xs:sequence></xs:complexType>
  <!-- Voll-optionaler Container fuer den Widerspruch aus #71: "zwingend"
       erzwingt hier nichts, weil kein Kind ein Pflicht-Rueckgrat bildet. -->
  <xs:complexType name="Type.Test.Extras"><xs:sequence>
    <xs:element name="notiz" type="xs:string" minOccurs="0"/>
  </xs:sequence></xs:complexType>
  <xs:complexType name="Type.Test.Anlage"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
  </xs:sequence></xs:complexType>
  <!-- Eigener Typ nur fuer beteiligung: ein wiederholbares Kind innerhalb des
       Vorkommen-Traegers, ohne die Punkt-Zaehlungen an anlage zu verschieben. -->
  <xs:complexType name="Type.Test.Bet"><xs:sequence>
    <xs:element name="name" type="xs:string"/>
    <xs:element name="kontakt" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
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
  let gespeicherteVorgabe: ProfileDoc | null;
  /** Vom Profil-Backend geliefertes Arbeitsstand-Dokument bzw. Version. */
  let arbeitsstand: ProfileDoc | null;
  let version: VersionMitDoc | null;
  /** Stub-Ergebnis der Schemavalidierung; Tests schalten um. */
  let pruefung: XmlValidierung;
  /** Gemeldete Toast-Texte (Sammelmeldung beim Speichern). */
  let toasts: string[];

  beforeEach(() => {
    created = [];
    toasts = [];
    patched = [];
    entscheidungen = null;
    gespeicherteVorgabe = null;
    arbeitsstand = null;
    version = null;
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
            loadVorgabe: async () => gespeicherteVorgabe,
          },
        },
        {
          provide: ProfileStoreService,
          useValue: {
            load: async () => arbeitsstand,
            loadVersion: async () => version,
          },
        },
        { provide: TestmessageGenerationService, useValue: { ensureSchema: async () => {} } },
        { provide: PersistenceService, useValue: { flushAutosave: async () => {} } },
        { provide: ToastService, useValue: { show: (t: string) => toasts.push(t) } },
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

    it('setzt einen bestehenden Abnahme-Schreibschutz zurueck', async () => {
      state.abnahmeSchreibschutz.set(true); // zuvor abgenommene Testnachricht offen
      await svc.neuErstellen('3.6.2', M);
      expect(state.abnahmeSchreibschutz()).toBeFalse();
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
        fehlerDetails: [
          { text: "Element 'zusatzAngabe': This element is not expected.", zeile: 3 },
        ],
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
        id: 'id-alt',
        name: 'Entwurf.xml',
        groesse: 1,
        hochgeladen: 0,
        aktualisiert: 0,
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

  describe('neuAusProfil (Bindung an eine Profilfassung)', () => {
    /** Bibliothekseintrag der Profilierung (Arbeitsstand vom 30.07.2026). */
    const profil = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
      id: 'p1',
      name: 'Nachlass-Szenario',
      nachricht: M,
      xjustizVersion: '3.6.2',
      nStatus: 3,
      nAusp: 0,
      aktualisiert: Date.UTC(2026, 6, 30, 10, 0),
      ...over,
    });

    /** Profil-Dokument mit ausgeschlossenem az-Blatt. */
    const doc = (over: Partial<ProfileDoc> = {}): ProfileDoc => ({
      meta: { name: 'Nachlass-Szenario', nachricht: M, xjustizVersion: '3.6.2' },
      statuses: [
        { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
      ],
      elemente: { [`${M}/az`]: { status: 'v9' } },
      auspraegungen: {},
      erweiterungen: {},
      ...over,
    });

    it('bindet den Arbeitsstand als Vorgabe und startet ohne Versions-/Nachrichtenwahl', async () => {
      arbeitsstand = doc();

      await svc.neuAusProfil(profil(), null);

      expect(state.msgName()).toBe(M); // Nachrichtentyp stammt aus dem Profil
      expect(state.hatVorgabe()).toBeTrue();
      expect(state.vorgabe()!.elemente[`${M}/az`]).toEqual({ status: 'v9' });
      expect(state.messageCreate()).toEqual(
        jasmine.objectContaining({
          msgName: M,
          entryId: null,
          profilId: 'p1',
          profilName: 'Nachlass-Szenario',
          fassung: 'Arbeitsstand vom 30.07.2026',
        }),
      );
      expect(state.guided()).toBeTrue();
      expect(state.view()).toBe('editor');
      // Der Entscheidungsstand bleibt leer — die Vorgabe ist eine eigene Schicht.
      expect(state.elemente()).toEqual({});
    });

    it('bindet eine nummerierte Version und nennt sie als Fassung', async () => {
      version = { id: 'ver3', nr: 3, erstellt: 0, doc: doc() };

      await svc.neuAusProfil(profil(), 'ver3');

      expect(state.messageCreate()!.fassung).toBe('v3');
      expect(state.vorgabe()!.elemente[`${M}/az`]).toEqual({ status: 'v9' });
    });

    it('friert die Fassung ein — spaetere Aenderungen am Quelldokument wirken nicht', async () => {
      const quelle = doc();
      arbeitsstand = quelle;

      await svc.neuAusProfil(profil(), null);
      quelle.elemente[`${M}/az`] = { status: 'anders' };

      expect(state.vorgabe()!.elemente[`${M}/az`]).toEqual({ status: 'v9' });
    });

    it('wirft, wenn die Profilierung keinen Nachrichtentyp nennt', async () => {
      arbeitsstand = doc({ meta: { name: 'ohne Nachricht' } });
      await expectAsync(svc.neuAusProfil(profil({ nachricht: null }), null)).toBeRejected();
    });

    it('wirft, wenn die Fassung nicht ladbar ist', async () => {
      arbeitsstand = null;
      await expectAsync(svc.neuAusProfil(profil(), null)).toBeRejected();
    });

    it('materialisiert die im Profil eingegrenzte Mindestanzahl', async () => {
      arbeitsstand = doc({
        elemente: {
          // Schema 2..*, Profil verlangt drei.
          [`${M}/anlage`]: { min: '3' },
          // Schema 0..*, Profil verlangt zwei.
          [`${M}/beteiligung`]: { min: '2' },
        },
      });

      await svc.neuAusProfil(profil(), null);

      expect(state.auspsOf(`${M}/anlage`)?.length).toBe(3);
      expect(state.auspsOf(`${M}/beteiligung`)?.length).toBe(2);
      // Die entstandenen Vorkommen sind nicht entfernbar.
      expect(guided.kardSperreEntfernen(`${M}/beteiligung`)).toContain('2');
    });

    it('materialisiert die Mindestanzahl auch innerhalb eines benannten Vorkommens', async () => {
      arbeitsstand = doc({
        statuses: [
          { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
          { id: 'v1', name: 'zwingend', farbe: '#1D9E75', wirkung: 'pflicht' },
        ],
        elemente: {
          // Zwingend, damit der Walk in den Teilbaum absteigt.
          [`${M}/beteiligung`]: { status: 'v1' },
          // Generisch eingegrenzt — gilt in jedem Vorkommen (#59).
          [`${M}/beteiligung/kontakt`]: { min: '2' },
        },
        auspraegungen: { [`${M}/beteiligung`]: [{ id: 'n1', name: 'Notar/in' }] },
      });

      await svc.neuAusProfil(profil(), null);

      // Der Walk muss durch den Vorkommen-Kontext laufen: die Vorkommen gehoeren
      // an den Pfad des benannten Vorkommens. Am generischen Pfad angelegt waeren
      // sie unsichtbar — der Baum rendert dort die Auspraegung, nicht die
      // generischen Kinder.
      expect(state.auspsOf(`${M}/beteiligung@n1/kontakt`)?.length).toBe(2);
      expect(state.auspraegungen()[`${M}/beteiligung/kontakt`]).toBeUndefined();
    });

    it('laesst die Schema-Kardinalitaet unberuehrt, wo das Profil nichts eingrenzt', async () => {
      arbeitsstand = doc();

      await svc.neuAusProfil(profil(), null);

      expect(state.auspsOf(`${M}/anlage`)?.length).toBe(2); // Schema-Mindestanzahl
      expect(state.auspsOf(`${M}/beteiligung`)).toBeNull(); // schema-optional
    });

    it('legt keine Mindest-Vorkommen unter ausgeschlossenen Elementen an', async () => {
      arbeitsstand = doc({ elemente: { [`${M}/anlage`]: { status: 'v9' } } });

      await svc.neuAusProfil(profil(), null);

      expect(state.auspraegungen()[`${M}/anlage`]).toBeUndefined();
    });

    it('meldet beim Start den Widerspruch aus Ausschluss und Mindestanzahl', async () => {
      arbeitsstand = doc({ elemente: { [`${M}/anlage`]: { status: 'v9', min: '2' } } });

      await svc.neuAusProfil(profil(), null);

      const report = TestBed.inject(ValidationReportService);
      expect(report.offen()).toBeTrue();
      expect(report.titel()).toContain('Widersprüche');
      expect(report.eintraege().length).toBe(1);
      const eintrag = report.eintraege()[0]!;
      expect(eintrag.pfad).toBe(`${M}/anlage`); // Sprung zum betroffenen Element
      expect(eintrag.text).toContain('nicht verwendet');
      expect(eintrag.text).toContain('2');
      // Der Ausschluss gewinnt: keine Vorkommen, kein Entscheidungspunkt.
      expect(state.auspraegungen()[`${M}/anlage`]).toBeUndefined();
      expect(guided.punktAt(`${M}/anlage`)).toBeNull();
    });

    it('meldet einen zwingenden Container, unter dem nichts zwingend ist (#71)', async () => {
      // Entschieden 26.08.03: die Konstellation soll in einer Profilierung
      // nicht vorkommen — sie wird beim Start als Mangel gemeldet, statt eine
      // neue Walk-Semantik zu bekommen.
      arbeitsstand = doc({
        statuses: [
          { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
          { id: 'v1', name: 'zwingend', farbe: '#1D9E75', wirkung: 'pflicht' },
        ],
        elemente: { [`${M}/extras`]: { status: 'v1' } },
      });

      await svc.neuAusProfil(profil(), null);

      const report = TestBed.inject(ValidationReportService);
      expect(report.offen()).toBeTrue();
      expect(report.eintraege().length).toBe(1);
      expect(report.eintraege()[0]!.pfad).toBe(`${M}/extras`);
      expect(report.eintraege()[0]!.text).toContain('erzwingt hier nichts');
    });

    it('kein Mangel, wenn ein Kind zwingend gesetzt oder das Schema-Rueckgrat da ist (#71)', async () => {
      arbeitsstand = doc({
        statuses: [
          { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
          { id: 'v1', name: 'zwingend', farbe: '#1D9E75', wirkung: 'pflicht' },
        ],
        elemente: {
          // extras erzwingt ueber das zwingend gesetzte Kind etwas …
          [`${M}/extras`]: { status: 'v1' },
          [`${M}/extras/notiz`]: { status: 'v1' },
          // … und beteiligung traegt ein Schema-Pflichtkind (name).
          [`${M}/beteiligung`]: { status: 'v1' },
        },
      });

      await svc.neuAusProfil(profil(), null);

      const report = TestBed.inject(ValidationReportService);
      expect(report.offen()).toBeFalse();
    });

    it('meldet auch den vererbten Ausschluss — der Teilbaum wird sonst still halbiert', async () => {
      arbeitsstand = doc({
        elemente: {
          [`${M}/anlage`]: { status: 'v9' },
          // Die Profilierung verlangt das Blatt, sein Traeger ist ausgeschlossen.
          [`${M}/anlage/name`]: { min: '1' },
        },
      });

      await svc.neuAusProfil(profil(), null);

      const report = TestBed.inject(ValidationReportService);
      expect(report.offen()).toBeTrue();
      expect(report.eintraege().length).toBe(1);
      const eintrag = report.eintraege()[0]!;
      expect(eintrag.pfad).toBe(`${M}/anlage/name`); // Sprung zum verlangten Element
      expect(eintrag.text).toContain('nicht verwendet');
      expect(eintrag.text).toContain(`${M}/anlage`); // der ausschliessende Vorfahr
    });

    it('meldet nichts, solange die Profilierung widerspruchsfrei ist', async () => {
      arbeitsstand = doc({ elemente: { [`${M}/anlage`]: { min: '3' } } });

      await svc.neuAusProfil(profil(), null);

      expect(TestBed.inject(ValidationReportService).offen()).toBeFalse();
    });

    it('speichern legt Herkunft und eingefrorene Kopie am Eintrag ab', async () => {
      arbeitsstand = doc();
      await svc.neuAusProfil(profil(), null);
      spyOn(window, 'prompt').and.returnValue('Testfall 1.xml');

      expect(await svc.speichern()).toBeTrue();

      const input = created[0]!;
      expect(input.profilId).toBe('p1');
      expect(input.profilName).toBe('Nachlass-Szenario');
      expect(input.fassung).toBe('Arbeitsstand vom 30.07.2026');
      expect(input.vorgabe!.elemente[`${M}/az`]).toEqual({ status: 'v9' });
      // Entscheidungsstand und Vorgabe bleiben getrennt.
      expect(input.entscheidungen!.profil.elemente[`${M}/az`]).toBeUndefined();
    });

    it('nennt beim Speichern die beruehrten ungeklaerten und nicht profilierten Elemente', async () => {
      arbeitsstand = doc({
        statuses: [
          { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
          { id: 'v1', name: 'zwingend', farbe: '#a00', wirkung: 'pflicht' },
          { id: 'v4', name: 'zu klären', farbe: '#fa0', wirkung: 'markierung' },
        ],
        elemente: {
          [`${M}/az`]: { status: 'v9' },
          [`${M}/anlage`]: { status: 'v1' },
          [`${M}/anlage/name`]: { status: 'v4' },
        },
      });
      await svc.neuAusProfil(profil(), null);
      spyOn(window, 'prompt').and.returnValue('X.xml');
      spyOn(window, 'confirm').and.returnValue(true);
      guided.fuellePflichtfelder();

      await svc.speichern();

      // kopf: keine Festlegung. Die beiden Mindest-Vorkommen erben "zwingend",
      // ihre name-Blaetter die Markierung.
      expect(toasts.at(-1)).toContain('2 ungeklärt');
      expect(toasts.at(-1)).toContain('1 nicht profiliert');
    });

    it('Schema-Erweiterungen der Profilierung sind Punkte und machen keinen Entwurf', async () => {
      arbeitsstand = doc({
        elemente: {},
        erweiterungen: {
          [M]: [{ id: 'e1', name: 'zusatzAngabe', min: '1', max: '1', datentyp: 'string' }],
        },
      });
      await svc.neuAusProfil(profil(), null);

      // Die Erweiterung ist regulaerer Entscheidungspunkt des Durchlaufs.
      expect(guided.punktAt(`${M}/~e1`)?.art).toBe('wert');

      // Der einzige Schemaverstoss geht auf die Erweiterung zurueck (der Fehler
      // wird an einer anderen Zeile gemeldet — Namens-Fallback).
      pruefung = {
        status: 'invalide',
        fehler: ['nicht erwartet'],
        fehlerDetails: [
          { text: "Element 'zusatzAngabe': This element is not expected.", zeile: 3 },
        ],
      };
      spyOn(window, 'prompt').and.returnValue('X.xml');
      guided.fuellePflichtfelder();
      spyOn(window, 'confirm').and.returnValue(true);

      await svc.speichern();

      expect(created[0]!.entwurf).toBeFalse();
      expect(created[0]!.xml).toContain('zusatzAngabe'); // mitbefuellt, nicht weggelassen
    });

    it('fortsetzen laedt die gebundene Kopie, nicht die aktuelle Profilfassung', async () => {
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
      gespeicherteVorgabe = doc();
      // Die Profilierung wurde inzwischen weiterentwickelt — das darf nicht wirken.
      arbeitsstand = doc({ elemente: {} });

      await svc.fortsetzen({
        id: 'id-alt',
        name: 'Entwurf.xml',
        groesse: 1,
        hochgeladen: 0,
        aktualisiert: 0,
        profilId: 'p1',
        profilName: 'Nachlass-Szenario',
        fassung: 'v3',
      });

      expect(state.hatVorgabe()).toBeTrue();
      expect(state.wirkungOf(`${M}/az`)).toBe('ausgeschlossen');
      expect(state.messageCreate()).toEqual(
        jasmine.objectContaining({ profilId: 'p1', fassung: 'v3' }),
      );
    });

    it('fortsetzen meldet die Widersprueche der gebundenen Kopie ebenfalls', async () => {
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
      gespeicherteVorgabe = doc({ elemente: { [`${M}/anlage`]: { status: 'v9', min: '2' } } });

      await svc.fortsetzen({
        id: 'id-alt',
        name: 'Entwurf.xml',
        groesse: 1,
        hochgeladen: 0,
        aktualisiert: 0,
        profilId: 'p1',
        profilName: 'Nachlass-Szenario',
        fassung: 'v3',
      });

      const report = TestBed.inject(ValidationReportService);
      expect(report.offen()).toBeTrue();
      expect(report.titel()).toContain('Widersprüche');
      expect(report.eintraege()[0]!.pfad).toBe(`${M}/anlage`);
    });

    it('ungebundene Alt-Eintraege setzen wie bisher fort (keine Vorgabe)', async () => {
      entscheidungen = {
        msgName: M,
        xjustizVersion: '3.6.2',
        profil: {
          meta: {},
          statuses: state.statuses(),
          elemente: {},
          auspraegungen: {},
          erweiterungen: {},
        },
      };
      gespeicherteVorgabe = null;

      await svc.fortsetzen({
        id: 'id-alt',
        name: 'Alt.xml',
        groesse: 1,
        hochgeladen: 0,
        aktualisiert: 0,
      });

      expect(state.hatVorgabe()).toBeFalse();
      expect(state.messageCreate()!.profilId).toBeUndefined();
    });
  });

  describe('weitereTestnachricht (Serie zur selben Profilfassung)', () => {
    const profil: LibraryEntry = {
      id: 'p1',
      name: 'Nachlass-Szenario',
      nachricht: M,
      xjustizVersion: '3.6.2',
      nStatus: 3,
      nAusp: 0,
      aktualisiert: Date.UTC(2026, 6, 30, 10, 0),
    };

    const doc = (): ProfileDoc => ({
      meta: { name: 'Nachlass-Szenario', nachricht: M, xjustizVersion: '3.6.2' },
      statuses: [
        { id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
      ],
      elemente: { [`${M}/az`]: { status: 'v9' } },
      auspraegungen: {},
      erweiterungen: {},
    });

    /** Gebundener Durchlauf, befuellt und einmal gespeichert. */
    async function ersteGespeichert(): Promise<void> {
      arbeitsstand = doc();
      await svc.neuAusProfil(profil, null);
      guided.fuellePflichtfelder();
      spyOn(window, 'prompt').and.returnValues('Testfall 1.xml', 'Testfall 2.xml');
      spyOn(window, 'confirm').and.returnValue(true);
      await svc.speichern();
    }

    it('startet leer: dieselbe Bindung, leerer Entscheidungsstand, eigener Eintrag', async () => {
      await ersteGespeichert();

      await svc.weitereTestnachricht(false);

      expect(state.hatVorgabe()).toBeTrue();
      expect(state.vorgabe()!.elemente[`${M}/az`]).toEqual({ status: 'v9' });
      expect(state.messageCreate()).toEqual(
        jasmine.objectContaining({
          msgName: M,
          entryId: null,
          name: null,
          profilId: 'p1',
          profilName: 'Nachlass-Szenario',
          fassung: 'Arbeitsstand vom 30.07.2026',
        }),
      );
      // Werte der eben gespeicherten Nachricht sind nicht uebernommen.
      expect(Object.values(state.elemente()).some((p) => p.beispiel)).toBeFalse();
      expect(state.guided()).toBeTrue();
      expect(state.view()).toBe('editor');
    });

    it('als Kopie: uebernimmt Werte und Entscheidungsstand', async () => {
      await ersteGespeichert();
      const kopfWert = state.elemente()[`${M}/kopf`]!.beispiel;
      const nameWert = state.auspsOf(`${M}/anlage`)!.map((a) => `${M}/anlage@${a.id}/name`);

      await svc.weitereTestnachricht(true);

      expect(state.elemente()[`${M}/kopf`]?.beispiel).toBe(kopfWert);
      expect(state.auspsOf(`${M}/anlage`)?.length).toBe(2);
      for (const p of nameWert) expect(state.elemente()[p]?.beispiel).toBeTruthy();
      expect(state.hatVorgabe()).toBeTrue();
      expect(state.messageCreate()!.entryId).toBeNull();
    });

    it('als Kopie: der Durchlauf steht auf den noch offenen Punkten', async () => {
      await ersteGespeichert();
      const vorher = guided.fortschritt();

      await svc.weitereTestnachricht(true);

      // Uebernommene Entscheidungen zaehlen weiter als entschieden; offen bleibt,
      // was auch in der Vorlage offen war (hier das optionale beteiligung).
      expect(guided.fortschritt()).toEqual(vorher);
      expect(guided.offenePflicht()).toBe(0);
      expect(guided.nextOpen(null)).toBe(`${M}/beteiligung`);
    });

    it('leer: die Pflichtpunkte sind wieder offen', async () => {
      await ersteGespeichert();
      const vorher = guided.fortschritt();

      await svc.weitereTestnachricht(false);

      expect(guided.fortschritt().x).toBeLessThan(vorher.x);
      expect(guided.offenePflicht()).toBeGreaterThan(0);
    });

    it('das erste Speichern legt einen eigenen Eintrag an — die Vorlage bleibt unberuehrt', async () => {
      await ersteGespeichert();
      await svc.weitereTestnachricht(true);

      expect(await svc.speichern()).toBeTrue();

      expect(created.length).toBe(2);
      expect(patched.length).toBe(0); // der Ausgangseintrag wird nicht angefasst
      expect(created[1]!.name).toBe('Testfall 2.xml');
      // Dieselbe Bindung: Herkunft und eingefrorene Kopie wie beim Ausgangseintrag.
      expect(created[1]!.profilId).toBe('p1');
      expect(created[1]!.fassung).toBe('Arbeitsstand vom 30.07.2026');
      expect(created[1]!.vorgabe!.elemente[`${M}/az`]).toEqual({ status: 'v9' });
      expect(state.messageCreate()!.entryId).toBe('id-neu');
    });

    it('verweigert die Serie vor dem ersten Speichern und ohne Bindung', async () => {
      arbeitsstand = doc();
      await svc.neuAusProfil(profil, null);
      await expectAsync(svc.weitereTestnachricht(false)).toBeRejected(); // noch nicht gespeichert

      await svc.neuErstellen('3.6.2', M); // Einstieg aus dem Schema, keine Bindung
      await expectAsync(svc.weitereTestnachricht(false)).toBeRejected();
    });
  });
});
