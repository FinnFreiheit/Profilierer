import { TestBed } from '@angular/core/testing';
import { DownloadService } from './download.service';

describe('DownloadService.xmlFilename', () => {
  let dl: DownloadService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    dl = TestBed.inject(DownloadService);
  });

  it('haengt die Endung an, wenn der Name keine traegt', () => {
    expect(dl.xmlFilename('Quelle (bearbeitet 26.08.06)')).toBe('Quelle (bearbeitet 26.08.06).xml');
  });

  it('verdoppelt eine vorhandene Endung nicht (auch nicht bei Grossschreibung)', () => {
    expect(dl.xmlFilename('nachricht.xml')).toBe('nachricht.xml');
    expect(dl.xmlFilename('nachricht.XML')).toBe('nachricht.xml');
  });

  it('faellt bei leerem Namen auf „testnachricht" zurueck', () => {
    expect(dl.xmlFilename('')).toBe('testnachricht.xml');
    expect(dl.xmlFilename('   ')).toBe('testnachricht.xml');
    expect(dl.xmlFilename('.xml')).toBe('testnachricht.xml');
  });

  it('setzt den Zusatz vor die Endung', () => {
    expect(dl.xmlFilename('nachricht.xml', '.abgenommen')).toBe('nachricht.abgenommen.xml');
    expect(dl.xmlFilename('Quelle (bearbeitet)', '.abgenommen')).toBe(
      'Quelle (bearbeitet).abgenommen.xml',
    );
  });
});
