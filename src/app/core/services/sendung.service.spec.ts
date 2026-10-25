import { TestBed } from '@angular/core/testing';
import { SendungService, paketName } from './sendung.service';
import { StateService } from './state.service';
import { ExportService } from './export.service';
import { AnlagenStoreService } from './anlagen-store.service';
import { AnlageEntry, MessageEditSession } from '../../models/testmessage.model';

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

  beforeEach(() => {
    liste = jasmine.createSpy('liste').and.resolveTo([]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ExportService,
          useValue: { buildBeispielXmlMitPfaden: () => ({ xml: XML, zeilenPfade: new Map() }) },
        },
        {
          provide: AnlagenStoreService,
          useValue: { liste, ablegen: jasmine.createSpy().and.resolveTo(anlage('x')) },
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
    expect(sendung.ohnePlatz().map((a) => a.dateiname)).toEqual(['alt.pdf']);
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
});
