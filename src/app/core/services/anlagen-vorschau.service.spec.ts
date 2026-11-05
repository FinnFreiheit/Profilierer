import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AnlagenVorschauService } from './anlagen-vorschau.service';
import { AnlagenStoreService } from './anlagen-store.service';
import { SendungService } from './sendung.service';
import { ToastService } from './toast.service';

describe('AnlagenVorschauService', () => {
  let ablage: Record<string, Blob>;
  let meldungen: string[];

  const dienst = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AnlagenStoreService,
          useValue: { laden: async (_id: string, n: string) => ablage[n] ?? null },
        },
        {
          provide: SendungService,
          useValue: {
            entryId: signal('paket-1'),
            anlagen: signal([
              {
                dateiname: 'a.pdf',
                mime: 'application/octet-stream',
                groesse: 3,
                sha256: 'x',
                hochgeladen: 1,
              },
            ]),
          },
        },
        {
          provide: ToastService,
          useValue: { show: (t: string) => meldungen.push(t), showError: () => undefined },
        },
      ],
    });
    return TestBed.inject(AnlagenVorschauService);
  };

  beforeEach(() => {
    meldungen = [];
    ablage = {
      'a.pdf': new Blob(['%PDF'], { type: 'application/octet-stream' }),
      'n.xml': new Blob(['<a>Straße</a>'], { type: 'text/xml' }),
      's.pdf.pkcs7': new Blob([new Uint8Array([0x30, 0x82])]),
    };
  });

  it('PDF: Objekt-URL, Kenndaten aus der Ablage', async () => {
    const v = dienst();
    await v.oeffne('a.pdf');
    const o = v.offen()!;
    expect(o.art).toBe('pdf');
    expect(o.url).toMatch(/^blob:/);
    expect(o.anlage?.groesse).toBe(3);
    expect(o.text).toBe('');
  });

  it('XML: Text gelesen; Wechsel ersetzt die offene Vorschau', async () => {
    const v = dienst();
    await v.oeffne('a.pdf');
    await v.oeffne('n.xml');
    expect(v.offen()?.art).toBe('xml');
    expect(v.offen()?.text).toBe('<a>Straße</a>');
    v.schliesse();
    expect(v.offen()).toBeNull();
  });

  it('Signatur: binaer, ohne Text', async () => {
    const v = dienst();
    await v.oeffne('s.pdf.pkcs7');
    expect(v.offen()?.art).toBe('binaer');
  });

  it('ohne Datei: Meldung statt Dialog', async () => {
    const v = dienst();
    await v.oeffne('fehlt.pdf');
    expect(v.offen()).toBeNull();
    expect(meldungen[0]).toContain('fehlt.pdf');
  });
});
