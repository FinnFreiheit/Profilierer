import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Werkzeugleiste } from './werkzeugleiste';
import { StateService } from '../../core/services/state.service';
import { GuidedService } from '../../core/services/guided.service';
import { ToastService } from '../../core/services/toast.service';
import { TestmessageEditService } from '../../core/services/testmessage-edit.service';

/**
 * Das Modus-Segment (#80) ist seit ADR 0023 zweiwertig: Betrachten oder
 * Bearbeiten — einen eigenen gefuehrten Modus gibt es nicht mehr, Bearbeiten
 * fuehrt selbst. Getestet wird die Kopplung an `readOnly`.
 */
describe('Werkzeugleiste — Modus-Segment', () => {
  let state: StateService;
  let fixture: ComponentFixture<Werkzeugleiste>;
  /** Das Segment ist `protected`; der Test greift bewusst ueber den Typ hinweg zu. */
  let leiste: {
    modus: () => 'betrachten' | 'bearbeiten';
    setzeModus: (m: 'betrachten' | 'bearbeiten') => void;
    modusGesperrt: () => boolean;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Werkzeugleiste] }).compileComponents();
    state = TestBed.inject(StateService);
    fixture = TestBed.createComponent(Werkzeugleiste);
    leiste = fixture.componentInstance as unknown as typeof leiste;
    // hasRoot: das Segment ist ohne geladene Nachricht gesperrt.
    state.root.set({ path: 'r', name: 'r' } as never);
  });

  it('bietet nur noch Ansehen und Bearbeiten an', () => {
    fixture.detectChanges();
    const knoepfe = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.modusSeg button',
      ),
    ].map((b) => b.textContent?.trim());
    expect(knoepfe).toEqual(['Ansehen', 'Bearbeiten']);
  });

  it('leitet den Modus aus readOnly ab', () => {
    state.readOnly.set(false);
    expect(leiste.modus()).toBe('bearbeiten');

    state.readOnly.set(true);
    expect(leiste.modus()).toBe('betrachten');
  });

  it('schaltet auf Bearbeiten und nimmt dabei den Betrachtungsmodus zurück', () => {
    state.readOnly.set(true);

    leiste.setzeModus('bearbeiten');

    expect(state.readOnly()).toBe(false);
    expect(leiste.modus()).toBe('bearbeiten');
  });

  it('schaltet auf Betrachten', () => {
    state.readOnly.set(false);

    leiste.setzeModus('betrachten');

    expect(state.readOnly()).toBe(true);
  });

  it('laesst den aktiven Modus unberuehrt (kein Umschalten auf sich selbst)', () => {
    state.readOnly.set(false);
    const vorher = state.onlyValues();

    leiste.setzeModus('bearbeiten');

    expect(state.onlyValues()).toBe(vorher);
  });

  it('zeigt bei Abnahme-Schreibschutz Betrachten, auch wenn readOnly noch nicht gefolgt ist', () => {
    // Beim Oeffnen eines abgenommenen Profils setzen loadProfile und der
    // Schreibschutz-Effekt nacheinander dasselbe Signal; die Anzeige darf vom
    // Ausgang dieses Wettlaufs nicht abhaengen.
    state.readOnly.set(false);
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

  describe('bei einer geoeffneten Nachricht', () => {
    let edit: TestmessageEditService;

    beforeEach(() => {
      edit = TestBed.inject(TestmessageEditService);
      state.messageEdit.set({ entryId: 'e1' } as never);
      state.nachrichtBearbeiten(false);
    });

    it('laeuft der Weg ins Bearbeiten ueber den EditService (Rueckfrage #105)', () => {
      spyOn(edit, 'bearbeitenAnfordern').and.callFake(() => {
        state.nachrichtBearbeiten(true);
        return true;
      });

      leiste.setzeModus('bearbeiten');

      expect(edit.bearbeitenAnfordern).toHaveBeenCalled();
      expect(leiste.modus()).toBe('bearbeiten');
    });

    it('bleibt beim Betrachten, wenn der EditService ablehnt', () => {
      spyOn(edit, 'bearbeitenAnfordern').and.returnValue(false);

      leiste.setzeModus('bearbeiten');

      expect(leiste.modus()).toBe('betrachten');
    });

    it('schaltet mit Betrachten auch „nur Werte" wieder ein', () => {
      state.nachrichtBearbeiten(true);

      leiste.setzeModus('betrachten');

      expect(state.readOnly()).toBe(true);
      expect(state.onlyValues()).toBe(true);
    });
  });
});

/**
 * „Nächstes offenes Feld" ist derselbe Sprung wie die Enter-Taste und muss
 * derselben Sperre folgen: im Durchlauf einer Nachricht haelt eine offene
 * Pflichtangabe fest. Vorher sprang der Knopf daran vorbei — die Taste nicht.
 */
describe('Werkzeugleiste — Sprung zum naechsten offenen Feld', () => {
  let guided: GuidedService;
  let toast: jasmine.Spy;
  let leiste: { naechstesOffenes: () => void };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Werkzeugleiste] }).compileComponents();
    guided = TestBed.inject(GuidedService);
    toast = spyOn(TestBed.inject(ToastService), 'show');
    leiste = TestBed.createComponent(Werkzeugleiste).componentInstance as unknown as typeof leiste;
  });

  it('haelt an einer offenen Pflichtangabe fest und nennt den Grund', () => {
    spyOn(guided, 'ueberspringSperre').and.returnValue('Pflichtangabe — …');
    const sprung = spyOn(guided, 'gotoNextOpen');

    leiste.naechstesOffenes();

    expect(sprung).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Pflichtangabe — …');
  });

  it('springt, wenn nichts festhaelt', () => {
    spyOn(guided, 'ueberspringSperre').and.returnValue(null);
    const sprung = spyOn(guided, 'gotoNextOpen').and.returnValue(true);

    leiste.naechstesOffenes();

    expect(sprung).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('meldet, wenn nichts mehr offen ist', () => {
    spyOn(guided, 'ueberspringSperre').and.returnValue(null);
    spyOn(guided, 'gotoNextOpen').and.returnValue(false);

    leiste.naechstesOffenes();

    expect(toast).toHaveBeenCalledWith('Alle Felder beantwortet.');
  });
});
