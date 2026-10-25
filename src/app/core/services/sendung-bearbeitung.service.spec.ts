import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { SendungBearbeitungService, dateinameNachSyntax } from './sendung-bearbeitung.service';
import { SendungService, SendungsPlatz } from './sendung.service';
import { StateService } from './state.service';
import { GuidedService } from './guided.service';
import { Befund, Platz, plaetzeLesen } from '../../../../server/sendung/pruefung.js';

const R = 'n/schriftgutobjekte/dokument';

/** Zwei Dokumente: d1 mit Datei als Vorkommen, d2 mit generischer Datei. */
function modell(state: StateService): void {
  state.auspraegungen.set({
    [R]: [
      { id: 'v1', name: 'Vorkommen 1' },
      { id: 'v2', name: 'Vorkommen 2' },
    ],
    [`${R}@v1/fach/datei`]: [{ id: 'f1', name: 'Vorkommen 1' }],
  });
  state.elemente.set({
    [`${R}@v1/identifikation/id`]: { beispiel: 'd1' },
    [`${R}@v1/fach/datei@f1/dateiname`]: { beispiel: 'kv.pdf' },
    [`${R}@v1/fach/datei@f1/bestandteil`]: { beispiel: '001' },
    [`${R}@v2/identifikation/id`]: { beispiel: 'd2' },
    [`${R}@v2/fach/datei/dateiname`]: { beispiel: 'xjustiz_UUID.xml' },
    [`${R}@v2/fach/datei/bestandteil`]: { beispiel: '001' },
  });
}

/** XML samt Zeile→Pfad aus dem Modell — wie ExportService, nur flach. */
function xmlAus(state: StateService): { xml: string; zeilenPfade: Map<number, string> } {
  const zeilen = ['<n xmlns="http://www.xjustiz.de"><schriftgutobjekte>'];
  const pfade = new Map<number, string>();
  const el = state.elemente();
  const doks = state.auspsOf(R) ?? [];
  for (const d of doks) {
    const dok = `${R}@${d.id}`;
    zeilen.push(
      `<dokument><identifikation><id>${el[`${dok}/identifikation/id`]?.beispiel ?? ''}</id></identifikation><fach>`,
    );
    const liste = `${dok}/fach/datei`;
    const dateien = state.auspsOf(liste)?.map((a) => `${liste}@${a.id}`) ?? [liste];
    for (const f of dateien) {
      zeilen.push('<datei>');
      for (const tag of ['dateiname', 'bestandteil', 'dateiname.bezugsdatei']) {
        const w = el[`${f}/${tag}`]?.beispiel;
        if (w === undefined) continue;
        zeilen.push(
          tag === 'bestandteil'
            ? `<bestandteil><code>${w}</code></bestandteil>`
            : `<${tag}>${w}</${tag}>`,
        );
        pfade.set(zeilen.length, `${f}/${tag}`);
      }
      zeilen.push('</datei>');
    }
    zeilen.push('</fach></dokument>');
  }
  zeilen.push('</schriftgutobjekte></n>');
  return { xml: zeilen.join('\n'), zeilenPfade: pfade };
}

describe('SendungBearbeitungService', () => {
  let state: StateService;
  let svc: SendungBearbeitungService;
  let ablegen: jasmine.Spy;
  let umbenennen: jasmine.Spy;
  const lesen = (): Platz[] =>
    plaetzeLesen(new DOMParser().parseFromString(xmlAus(state).xml, 'application/xml'));

  beforeEach(() => {
    ablegen = jasmine.createSpy('ablegen').and.resolveTo();
    umbenennen = jasmine.createSpy('platzUmbenennen').and.resolveTo();
    TestBed.configureTestingModule({
      providers: [
        { provide: GuidedService, useValue: { kardSperreHinzu: () => null } },
        {
          provide: SendungService,
          useFactory: () => {
            const st = TestBed.inject(StateService);
            const xml = computed(() => xmlAus(st));
            return {
              xml,
              plaetze: computed(() =>
                plaetzeLesen(new DOMParser().parseFromString(xml().xml, 'application/xml')),
              ),
              aenderbar: signal(true),
              ablegen,
              platzUmbenennen: umbenennen,
              namensVorschlag: () => null,
            };
          },
        },
      ],
    });
    state = TestBed.inject(StateService);
    modell(state);
    svc = TestBed.inject(SendungBearbeitungService);
  });

  const sp = (name: string): SendungsPlatz =>
    ({ platz: lesen().find((p) => p.dateiname === name)! }) as SendungsPlatz;

  it('Signatur hinzufuegen: neues datei-Vorkommen mit .pkcs7, 003 und Bezug', () => {
    expect(svc.signaturMoeglich(sp('kv.pdf'))).toBe(true);
    svc.signaturHinzufuegen(sp('kv.pdf'));
    const sig = lesen().find((p) => p.dateiname === 'kv.pdf.pkcs7');
    expect(sig).toEqual(
      jasmine.objectContaining({ bestandteil: '003', bezugsdateien: ['kv.pdf'] }),
    );
    expect(svc.signaturMoeglich(sp('kv.pdf'))).toBe(false); // hat jetzt eine
  });

  it('generische Datei wird beim Hinzufuegen zum ersten Vorkommen (Werte bleiben)', () => {
    svc.signaturHinzufuegen(sp('xjustiz_UUID.xml'));
    expect(state.auspsOf(`${R}@v2/fach/datei`)?.length).toBe(2);
    expect(lesen().map((p) => p.dateiname)).toEqual([
      'kv.pdf',
      'xjustiz_UUID.xml',
      'xjustiz_UUID.xml.pkcs7',
    ]);
  });

  it('Sperre durch die gebundene Profilierung nennt den Grund', () => {
    spyOn(state, 'vorgabeGesperrt').and.callFake((p: string) => p.endsWith('/bestandteil'));
    expect(svc.signaturSperre(sp('kv.pdf'))).toContain('bestandteil');
  });

  it('Datei als neues Dokument: Vorkommen mit UUID, Nummer, Anzeigename, Datei; Upload', async () => {
    const name = await svc.alsDokumentAblegen(new File(['%PDF'], 'Vollmacht Notar.pdf'));
    expect(name).toMatch(/^Vollmacht_Notar_[0-9a-f-]{36}\.pdf$/);
    const neu = lesen().at(-1)!;
    expect(neu.dateiname).toBe(name!);
    expect(neu.bestandteil).toBe('001');
    const doks = state.auspsOf(R)!;
    const dok = `${R}@${doks.at(-1)!.id}`;
    expect(
      state.elemente()[`${dok}/identifikation/nummerImUebergeordnetenContainer`]?.beispiel,
    ).toBe('3');
    expect(state.elemente()[`${dok}/fach/anzeigename`]?.beispiel).toBe('Vollmacht Notar');
    expect(ablegen).toHaveBeenCalledWith(name, jasmine.any(File));
  });

  const befund = (regel: string, dateiname: string): Befund => ({
    regel,
    schwere: 'fehler',
    dateiname,
    text: '',
  });

  it('UUID einsetzen: Dokument-id statt wörtlich UUID, ueber platzUmbenennen', async () => {
    const fix = svc.behebung(befund('name-uuid', 'xjustiz_UUID.xml'))!;
    expect(fix.label).toBe('UUID einsetzen');
    await fix.ausfuehren();
    expect(umbenennen).toHaveBeenCalledWith('xjustiz_UUID.xml', 'xjustiz_d2.xml');
  });

  it('abgeleitete Signatur bekommt keine eigene UUID-Behebung', () => {
    svc.signaturHinzufuegen(sp('xjustiz_UUID.xml'));
    expect(svc.behebung(befund('name-uuid', 'xjustiz_UUID.xml.pkcs7'))).toBeNull();
  });

  it('Bezug setzen: Signatur ohne Endung als Ziel, Blattwert wird korrigiert', async () => {
    svc.signaturHinzufuegen(sp('kv.pdf'));
    const sigListe = `${R}@v1/fach/datei`;
    const sigId = state.auspsOf(sigListe)!.at(-1)!.id;
    state.setElementProfile(`${sigListe}@${sigId}/dateiname.bezugsdatei`, {
      beispiel: 'falsch.pdf',
    });
    const fix = svc.behebung(befund('bezug-fehlt', 'kv.pdf.pkcs7'))!;
    expect(fix.label).toBe('Bezug setzen');
    await fix.ausfuehren();
    expect(lesen().find((p) => p.dateiname === 'kv.pdf.pkcs7')!.bezugsdateien).toEqual(['kv.pdf']);
  });

  it('im Ansehen-Modus keine Behebungen', () => {
    (TestBed.inject(SendungService).aenderbar as ReturnType<typeof signal<boolean>>).set(false);
    expect(svc.behebung(befund('name-uuid', 'xjustiz_UUID.xml'))).toBeNull();
    expect(svc.dokumentSperre()).toBe('Nur im Bearbeiten-Modus.');
  });

  it('dateinameNachSyntax: Zeichen bereinigt, hoechstens 90 Zeichen', () => {
    const u = '0a7c4217-ef6f-4303-82d7-60ca84fdf3f5';
    expect(dateinameNachSyntax('Klage (final).PDF', u)).toBe(`Klage_final_${u}.pdf`);
    expect(dateinameNachSyntax('x'.repeat(200) + '.pdf', u).length).toBe(90);
    expect(dateinameNachSyntax('#.pdf', u)).toBe(`Dokument_${u}.pdf`);
  });
});
