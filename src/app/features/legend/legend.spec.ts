import { TestBed } from '@angular/core/testing';
import { Legend } from './legend';
import { StateService } from '../../core/services/state.service';
import { MessageCreateSession } from '../../models/testmessage.model';

/**
 * Die Fusszeile traegt seit #80 die Systemtelemetrie des offenen Profils.
 * Sie darf nicht in den Nachrichten-/Erzeugen-Modus durchschlagen: dort gehoert
 * sie zu einem Dokument, das gerade nicht bearbeitet wird.
 */
describe('Legend — Zustandstext', () => {
  let state: StateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Legend] }).compileComponents();
    state = TestBed.inject(StateService);
  });

  const text = (): string => {
    const fixture = TestBed.createComponent(Legend);
    fixture.detectChanges();
    return (
      (fixture.nativeElement as HTMLElement).querySelector('#zustandText')?.textContent?.trim() ??
      ''
    );
  };

  it('zeigt die Autosave-Meldung des offenen Profils', () => {
    state.autosaveInfo.set('automatisch gesichert 14:03');
    expect(text()).toContain('automatisch gesichert 14:03');
  });

  it('schweigt im Erzeugen-Modus statt die Meldung des vorigen Profils zu halten', () => {
    state.autosaveInfo.set('von der BLK-AG abgenommen — schreibgeschützt');
    state.messageCreate.set({ msgName: 'x', entryId: null, name: null } as MessageCreateSession);

    expect(text()).toBe('');
  });
});
