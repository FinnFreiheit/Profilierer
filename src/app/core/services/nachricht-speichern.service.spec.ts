import { TestBed } from '@angular/core/testing';
import { NachrichtSpeichernService } from './nachricht-speichern.service';

describe('NachrichtSpeichernService', () => {
  let svc: NachrichtSpeichernService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(NachrichtSpeichernService);
  });

  it('stellt die Frage und loest sie mit der Antwort des Dialogs auf', async () => {
    const p = svc.frage('upload.xml');
    expect(svc.anfrage()!.vorschlag).toBe('upload.xml');

    svc.antworte({ art: 'speichern', name: 'Neuer Name.xml' });

    expect(await p).toEqual({ art: 'speichern', name: 'Neuer Name.xml' });
    expect(svc.anfrage()).toBeNull();
  });

  it('feuert auch beim zweiten Mal mit gleichem Vorschlag (laufende Nummer)', async () => {
    const p1 = svc.frage('upload.xml');
    const erste = svc.anfrage()!.seq;
    svc.antworte({ art: 'verwerfen' });
    await p1;

    void svc.frage('upload.xml');
    expect(svc.anfrage()!.seq).toBeGreaterThan(erste);
  });

  it('laesst eine uebergangene Frage nicht haengen', async () => {
    const p1 = svc.frage('a.xml');
    void svc.frage('b.xml');
    expect(await p1).toEqual({ art: 'abbrechen' });
  });

  it('ignoriert eine zweite Antwort auf dieselbe Frage', async () => {
    const p = svc.frage('upload.xml');
    svc.antworte({ art: 'verwerfen' });
    svc.antworte({ art: 'speichern', name: 'zu spät.xml' });
    expect(await p).toEqual({ art: 'verwerfen' });
  });
});
