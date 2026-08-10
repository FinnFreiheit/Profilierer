import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RolleBadge } from './rolle-badge';
import { RolleService } from '../../core/services/rolle.service';

/**
 * Der Anmelde-Dialog haelt sich aus dem DOM heraus, solange er zu ist: ein
 * dauerhaft vorhandenes Passwortfeld laesst Passwortverwalter die ganze Seite
 * beobachten und macht das Tippen im Baum-Editor traege.
 */
describe('RolleBadge — Passwortfeld nur bei offenem Dialog', () => {
  let fix: ComponentFixture<RolleBadge>;
  let el: HTMLElement;

  const geheimfeld = (): Element | null => el.querySelector('input[type="password"]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolleBadge],
      providers: [
        {
          provide: RolleService,
          useValue: {
            agAktiv: () => false,
            anmelden: async () => 'ok',
            abmelden: () => {},
          },
        },
      ],
    }).compileComponents();
    fix = TestBed.createComponent(RolleBadge);
    fix.detectChanges();
    el = fix.nativeElement as HTMLElement;
  });

  it('haelt das Passwortfeld aus dem DOM, solange nicht angemeldet wird', () => {
    expect(geheimfeld()).toBeNull();
  });

  it('rendert und oeffnet den Dialog erst auf Klick und raeumt ihn beim Schliessen weg', async () => {
    (el.querySelector('.rolleAnmelden') as HTMLButtonElement).click();
    fix.detectChanges();

    const dlg = el.querySelector('dialog') as HTMLDialogElement;
    expect(dlg.open).toBe(true);
    expect(geheimfeld()).not.toBeNull();

    // Das native close-Ereignis kommt aus der Ereignisschlange des Browsers.
    const geschlossen = new Promise((fertig) =>
      dlg.addEventListener('close', () => fertig(null), { once: true }),
    );
    dlg.close();
    await geschlossen;
    fix.detectChanges();
    expect(geheimfeld()).toBeNull();
  });
});
