import { TestBed } from '@angular/core/testing';
import { Legend } from './legend';
import { StateService } from '../../core/services/state.service';
import { MessageCreateSession } from '../../models/testmessage.model';

/**
 * Die Fusszeile traegt seit #80 die Systemtelemetrie. Seit #105 gilt sie in
 * jedem Modus: auch Testnachrichten werden fortlaufend gesichert, und ohne die
 * Anzeige waere dem stillen Mechanismus nicht anzusehen, ob er laeuft. Dass
 * keine Meldung eines fremden Modus haengen bleibt, sichern die Einstiege
 * selbst (TestmessageAutosaveService.sitzungBeginnt raeumt das Signal).
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

  it('zeigt die Autosave-Meldung auch im Erzeugen-Modus', () => {
    state.messageCreate.set({ msgName: 'x', entryId: null, name: null } as MessageCreateSession);
    state.autosaveInfo.set('automatisch gesichert 14:07');

    expect(text()).toContain('automatisch gesichert 14:07');
  });

  it('schweigt, solange nichts gesichert wurde', () => {
    state.messageCreate.set({ msgName: 'x', entryId: null, name: null } as MessageCreateSession);
    state.autosaveInfo.set('');

    expect(text()).toBe('');
  });
});
