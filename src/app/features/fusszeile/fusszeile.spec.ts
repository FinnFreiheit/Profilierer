import { TestBed } from '@angular/core/testing';
import { Fusszeile } from './fusszeile';
import { StateService } from '../../core/services/state.service';
import { MessageCreateSession } from '../../models/testmessage.model';
import { WIRKUNG_ERKLAERUNG } from '../../core/profile-defaults';

/**
 * Die Fusszeile traegt seit #80 die Systemtelemetrie. Seit #105 gilt sie in
 * jedem Modus: auch Testnachrichten werden fortlaufend gesichert, und ohne die
 * Anzeige waere dem stillen Mechanismus nicht anzusehen, ob er laeuft. Dass
 * keine Meldung eines fremden Modus haengen bleibt, sichern die Einstiege
 * selbst (TestmessageAutosaveService.sitzungBeginnt raeumt das Signal).
 */
describe('Fusszeile — Zustandstext', () => {
  let state: StateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Fusszeile] }).compileComponents();
    state = TestBed.inject(StateService);
  });

  const text = (): string => {
    const fixture = TestBed.createComponent(Fusszeile);
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

/**
 * Die Hilfe ersetzt das alte Legenden-Band: sie erklaert zuerst, was eine
 * Antwort fuer die Nachricht bedeutet. Der Statusname ist frei gewaehlt —
 * verstaendlich wird er erst ueber die Erklaerung seiner Wirkung.
 */
describe('Fusszeile — Hilfe', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Fusszeile] }).compileComponents();
  });

  it('listet jede Statusstufe mit Erklärung', () => {
    const fixture = TestBed.createComponent(Fusszeile);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('.hilfeBtn')?.click();
    fixture.detectChanges();

    const panel = el.querySelector('.menuPanel')?.textContent ?? '';
    expect(panel).toContain('So wie im Standard');
    for (const s of TestBed.inject(StateService).statuses()) {
      expect(panel).toContain(s.name);
      expect(panel).toContain(WIRKUNG_ERKLAERUNG[s.wirkung]);
    }
  });
});
