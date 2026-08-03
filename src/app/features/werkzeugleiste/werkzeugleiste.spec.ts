import { TestBed } from '@angular/core/testing';
import { Werkzeugleiste } from './werkzeugleiste';
import { StateService } from '../../core/services/state.service';

/**
 * Das Modus-Segment (#80) fasst `readOnly` und `guided` zu einer einzigen,
 * dreiwertigen Wahl zusammen. Getestet wird die Kopplung selbst — sie ist die
 * eigentliche Verhaltensaenderung gegenueber den frueheren zwei Haekchen.
 */
describe('Werkzeugleiste — Modus-Segment', () => {
  let state: StateService;
  /** Das Segment ist `protected`; der Test greift bewusst ueber den Typ hinweg zu. */
  let leiste: {
    modus: () => 'betrachten' | 'bearbeiten' | 'gefuehrt';
    setzeModus: (m: 'betrachten' | 'bearbeiten' | 'gefuehrt') => void;
    modusGesperrt: () => boolean;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Werkzeugleiste] }).compileComponents();
    state = TestBed.inject(StateService);
    const fixture = TestBed.createComponent(Werkzeugleiste);
    leiste = fixture.componentInstance as unknown as typeof leiste;
    // hasRoot: das Segment ist ohne geladene Nachricht gesperrt.
    state.root.set({ path: 'r', name: 'r' } as never);
  });

  it('leitet den Modus aus readOnly und guided ab', () => {
    state.readOnly.set(false);
    state.guided.set(false);
    expect(leiste.modus()).toBe('bearbeiten');

    state.guided.set(true);
    expect(leiste.modus()).toBe('gefuehrt');

    // readOnly gewinnt: Betrachten heisst, keine Entscheidungen zu treffen.
    state.readOnly.set(true);
    expect(leiste.modus()).toBe('betrachten');
  });

  it('schaltet auf Geführt und nimmt dabei den Betrachtungsmodus zurück', () => {
    state.readOnly.set(true);
    state.guided.set(false);

    leiste.setzeModus('gefuehrt');

    expect(state.readOnly()).toBe(false);
    expect(state.guided()).toBe(true);
    expect(leiste.modus()).toBe('gefuehrt');
  });

  it('beendet mit Betrachten auch die Führung', () => {
    state.readOnly.set(false);
    state.guided.set(true);

    leiste.setzeModus('betrachten');

    expect(state.readOnly()).toBe(true);
    expect(state.guided()).toBe(false);
  });

  it('schliesst Führung und Bearbeiten gegenseitig aus', () => {
    state.readOnly.set(false);
    state.guided.set(true);

    leiste.setzeModus('bearbeiten');

    expect(state.guided()).toBe(false);
    expect(state.readOnly()).toBe(false);
  });

  it('laesst den aktiven Modus unberuehrt (kein Umschalten auf sich selbst)', () => {
    state.readOnly.set(false);
    state.guided.set(false);
    const vorher = state.onlyValues();

    leiste.setzeModus('bearbeiten');

    expect(state.onlyValues()).toBe(vorher);
  });

  it('zeigt bei Abnahme-Schreibschutz Betrachten, auch wenn readOnly noch nicht gefolgt ist', () => {
    // Beim Oeffnen eines abgenommenen Profils setzen loadProfile und der
    // Schreibschutz-Effekt nacheinander dasselbe Signal; die Anzeige darf vom
    // Ausgang dieses Wettlaufs nicht abhaengen.
    state.readOnly.set(false);
    state.guided.set(false);
    state.abnahmeSchreibschutz.set(true);

    expect(leiste.modus()).toBe('betrachten');
  });

  it('sperrt das Segment in der Schema-Ansicht', () => {
    state.schemaView.set(true);
    expect(leiste.modusGesperrt()).toBe(true);

    state.readOnly.set(true);
    leiste.setzeModus('bearbeiten');
    expect(state.readOnly()).toBe(true);
  });
});
