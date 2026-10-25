import { TestBed } from '@angular/core/testing';
import { SendungService, paketName } from './sendung.service';
import { StateService } from './state.service';
import { ExportService } from './export.service';
import { AnlagenStoreService } from './anlagen-store.service';
import {
  AnlageEntry,
  EinbindungEntry,
  MessageCreateSession,
  MessageEditSession,
} from '../../models/testmessage.model';
import { BackendClient } from './backend-client.service';

const datei = (name: string, bestandteil: string, bezug?: string): string =>
  `<datei><dateiname>${name}</dateiname><bestandteil><code>${bestandteil}</code></bestandteil>${
    bezug ? `<dateiname.bezugsdatei>${bezug}</dateiname.bezugsdatei>` : ''
  }</datei>`;

const XML = `<nachricht.x xmlns="http://www.xjustiz.de"><schriftgutobjekte>
  <dokument><identifikation><id>d1</id><nummerImUebergeordnetenContainer>1</nummerImUebergeordnetenContainer></identifikation>
    <xjustiz.fachspezifischeDaten><anzeigename>Kaufvertrag</anzeigename>
      ${datei('kv.pdf', '001')}${datei('kv.pdf.pkcs7', '003', 'kv.pdf')}
    </xjustiz.fachspezifischeDaten></dokument>
  <dokument><identifikation><id>d2</id><nummerImUebergeordnetenContainer>2</nummerImUebergeordnetenContainer></identifikation>
    <xjustiz.fachspezifischeDaten>${datei('bescheid.xml', '001')}</xjustiz.fachspezifischeDaten></dokument>
</schriftgutobjekte></nachricht.x>`;

const anlage = (dateiname: string): AnlageEntry => ({
  dateiname,
  groesse: 4,
  sha256: 'x',
  hochgeladen: 0,
});

describe('SendungService', () => {
  let state: StateService;
  let sendung: SendungService;
  let liste: jasmine.Spy;
  let einbindungen: jasmine.Spy;
  let einbinden: jasmine.Spy;
  let jsonOderNull: jasmine.Spy;

  beforeEach(() => {
    liste = jasmine.createSpy('liste').and.resolveTo([]);
    einbindungen = jasmine.createSpy('einbindungen').and.resolveTo([]);
    einbinden = jasmine.createSpy('einbinden').and.resolveTo({});
    jsonOderNull = jasmine.createSpy('jsonOderNull').and.resolveTo(null);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ExportService,
          useValue: { buildBeispielXmlMitPfaden: () => ({ xml: XML, zeilenPfade: new Map() }) },
        },
        {
          provide: AnlagenStoreService,
          useValue: {
            liste,
            einbindungen,
            einbinden,
            vorfahren: jasmine.createSpy().and.resolveTo([]),
            ablegen: jasmine.createSpy().and.resolveTo(anlage('x')),
          },
        },
        {
          provide: BackendClient,
          useValue: {
            fuer: () => ({ jsonOderNull, json: jsonOderNull, blobOderNull: jsonOderNull }),
          },
        },
      ],
    });
    state = TestBed.inject(StateService);
    sendung = TestBed.inject(SendungService);
  });

  const oeffne = (entryId: string | null): void =>
    state.messageEdit.set({ entryId, quellName: 'antrag.xml' } as MessageEditSession);

  it('gibt es nur fuer eine gespeicherte Testnachricht', () => {
    expect(sendung.moeglich()).toBe(false);
    oeffne(null);
    expect(sendung.moeglich()).toBe(false);
    oeffne('t1');
    expect(sendung.moeglich()).toBe(true);
  });

  it('gliedert die Plaetze nach Dokument und plant Platzhalter und Signatur', () => {
    oeffne('t1');
    const dok = sendung.dokumente();
    expect(dok.map((d) => d.titel)).toEqual(['Dokument 1 · Kaufvertrag', 'Dokument 2']);
    expect(dok[0]!.plaetze.map((p) => p.datei?.quelle)).toEqual(['platzhalter', 'signatur']);
    expect(dok[1]!.plaetze[0]!.datei).toBeNull();
    expect(dok[1]!.plaetze[0]!.befunde.map((b) => b.regel)).toEqual(['fehlt']);
    expect(sendung.zahlen()).toEqual({ fehler: 1, hinweise: 0 });
  });

  it('laedt die Anlagen der offenen Nachricht; ein Upload fuellt den Platz', async () => {
    liste.and.resolveTo([anlage('bescheid.xml'), anlage('alt.pdf')]);
    oeffne('t1');
    TestBed.tick();
    await liste.calls.mostRecent().returnValue;
    await Promise.resolve();
    expect(liste).toHaveBeenCalledWith('t1');
    const bescheid = sendung.dokumente()[1]!.plaetze[0]!;
    expect(bescheid.datei?.quelle).toBe('upload');
    expect(sendung.ohnePlatz().anlagen.map((a) => a.dateiname)).toEqual(['alt.pdf']);
    expect(sendung.befunde().map((b) => b.regel)).toEqual(['ohne-platz']);
  });

  it('aendert im Ansehen-Modus nichts', async () => {
    oeffne('t1');
    state.readOnly.set(true);
    expect(sendung.aenderbar()).toBe(false);
    const store = TestBed.inject(AnlagenStoreService);
    await sendung.ablegen('kv.pdf', new Blob(['x']));
    expect(store.ablegen).not.toHaveBeenCalled();
  });

  it('paketName: ohne .xml, unzulaessige Zeichen ersetzt', () => {
    expect(paketName('Antrag_Notar.xml')).toBe('Antrag_Notar_sendung.zip');
    expect(paketName('a/b:c')).toBe('a_b_c_sendung.zip');
    expect(paketName('')).toBe('testnachricht_sendung.zip');
  });

  const einb = (over: Partial<EinbindungEntry> = {}): EinbindungEntry => ({
    dateiname: 'bescheid.xml',
    zielId: 'b1',
    zielName: 'Bescheid',
    vorhanden: true,
    eingebunden: 0,
    ...over,
  });

  const geladen = async (): Promise<void> => {
    TestBed.tick();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r));
  };

  it('eingebundene Nachricht: Platz belegt, ihre Plaetze eingerueckt und mitgeprueft', async () => {
    einbindungen.and.resolveTo([einb()]);
    jsonOderNull.and.resolveTo({
      plaetze: [
        { dateiname: 'kv.pdf', bestandteil: '001', bezugsdateien: [], herkunft: 'Bescheid' },
      ],
      dateien: [{ dateiname: 'kv.pdf', quelle: 'platzhalter' }],
      befunde: [],
    });
    oeffne('t1');
    await geladen();
    const platz = sendung.dokumente()[1]!.plaetze[0]!;
    expect(platz.datei?.quelle).toBe('testnachricht');
    expect(platz.unter.map((u) => u.platz.dateiname)).toEqual(['kv.pdf']);
    // kv.pdf gibt es jetzt zweimal in der flachen Sendung
    expect(sendung.befunde().some((b) => b.regel === 'doppelt' && b.dateiname === 'kv.pdf')).toBe(
      true,
    );
  });

  it('geloeschte Quelle: Platz leer, Befund einbindung-fehlt', async () => {
    einbindungen.and.resolveTo([einb({ vorhanden: false })]);
    oeffne('t1');
    await geladen();
    const platz = sendung.dokumente()[1]!.plaetze[0]!;
    expect(platz.datei).toBeNull();
    expect(platz.befunde.map((b) => b.regel).sort()).toEqual(['einbindung-fehlt', 'fehlt']);
  });

  it('namensVorschlag nach Konvention aus der Dokument-id', () => {
    oeffne('t1');
    const bescheid = sendung.plaetze().find((p) => p.dateiname === 'bescheid.xml')!;
    expect(sendung.namensVorschlag(bescheid)).toBe('xjustiz_nachricht_d2.xml');
    expect(
      sendung.namensVorschlag({ ...bescheid, dateiname: 'xjustiz_nachricht_d2.xml' }),
    ).toBeNull();
    expect(sendung.namensVorschlag({ ...bescheid, dateiname: 'xjustiz_nachricht_UUID.xml' })).toBe(
      'xjustiz_nachricht_d2.xml',
    );
  });

  it('einbinden mit Umbenennen setzt die Blattwerte und bindet unter dem neuen Namen ein', async () => {
    oeffne('t1');
    const spy = spyOn(state, 'setElementProfile');
    const exp = TestBed.inject(ExportService) as unknown as {
      buildBeispielXmlMitPfaden: () => unknown;
    };
    exp.buildBeispielXmlMitPfaden = () => ({
      xml: [
        '<x>',
        '<tns:dateiname>bescheid.xml</tns:dateiname>',
        '<tns:dateiname>bescheid.xml.pkcs7</tns:dateiname>',
        '<tns:dateiname.bezugsdatei>bescheid.xml</tns:dateiname.bezugsdatei>',
        '<tns:dateiname>kv.pdf</tns:dateiname>',
      ].join('\n'),
      zeilenPfade: new Map([
        [2, 'p/datei/dateiname'],
        [3, 'p/datei#2/dateiname'],
        [4, 'p/datei#2/bezug'],
        [5, 'p/kv/dateiname'],
      ]),
    });
    const platz = { dateiname: 'bescheid.xml', bestandteil: '001', bezugsdateien: [] };
    await sendung.einbinden(platz, 'b1', 'xjustiz_nachricht_d2.xml');
    expect(spy.calls.allArgs()).toEqual([
      ['p/datei/dateiname', { beispiel: 'xjustiz_nachricht_d2.xml' }],
      ['p/datei#2/dateiname', { beispiel: 'xjustiz_nachricht_d2.xml.pkcs7' }],
      ['p/datei#2/bezug', { beispiel: 'xjustiz_nachricht_d2.xml' }],
    ]);
    expect(einbinden).toHaveBeenCalledWith('t1', 'xjustiz_nachricht_d2.xml', 'b1');
  });

  it('Ruecksprung: neue Nachricht wird nach dem ersten Speichern eingebunden', async () => {
    spyOn(window, 'confirm').and.returnValue(false);
    sendung.ruecksprung.set({ quelleId: 't1', quelleName: 'Antrag', dateiname: 'bescheid.xml' });
    state.messageCreate.set({ msgName: 'n', entryId: null, name: null });
    TestBed.tick();
    expect(einbinden).not.toHaveBeenCalled();
    state.messageCreate.set({ msgName: 'n', entryId: 'neu', name: 'B' } as MessageCreateSession);
    TestBed.tick();
    await Promise.resolve();
    expect(einbinden).toHaveBeenCalledWith('t1', 'bescheid.xml', 'neu');
    expect(sendung.ruecksprung()).toBeNull();
  });

  it('Ruecksprung verfaellt, wenn das Anlegen ohne Speichern endet', () => {
    sendung.ruecksprung.set({ quelleId: 't1', quelleName: 'Antrag', dateiname: 'bescheid.xml' });
    state.messageCreate.set({ msgName: 'n', entryId: null, name: null });
    TestBed.tick();
    state.messageCreate.set(null);
    TestBed.tick();
    expect(sendung.ruecksprung()).toBeNull();
    expect(einbinden).not.toHaveBeenCalled();
  });

  it('lageNachPfad: datei-Element und seine Blaetter fuehren zum Platz', () => {
    oeffne('t1');
    state.elemente.set({
      'n/dok@d1/fach/datei@f1/dateiname': { beispiel: 'kv.pdf' },
      'n/dok@d1/fach/datei@f1/bestandteil': { beispiel: '001' },
      'n/dok@d2/fach/datei/dateiname': { beispiel: 'bescheid.xml' },
      'n/sonst/dateiname': { beispiel: 'kv.pdf' }, // kein datei-Element
    });
    expect(sendung.platzAnPfad('n/dok@d1/fach/datei@f1')?.platz.dateiname).toBe('kv.pdf');
    expect(sendung.platzAnPfad('n/dok@d1/fach/datei@f1/bestandteil')?.platz.dateiname).toBe(
      'kv.pdf',
    );
    expect(sendung.platzAnPfad('n/dok@d2/fach/datei')?.datei).toBeNull();
    expect(sendung.platzAnPfad('n/sonst')).toBeNull();
    expect(sendung.platzAnPfad(null)).toBeNull();
  });

  it('zeige: wechselt in die Sendung und zaehlt den Fokus hoch', () => {
    sendung.zeige('kv.pdf');
    sendung.zeige('kv.pdf');
    expect(state.darstellung()).toBe('sendung');
    expect(sendung.fokus()).toEqual({ dateiname: 'kv.pdf', n: 2 });
  });
});
