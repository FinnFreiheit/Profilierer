import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Ortzeile } from './ortzeile';
import { StateService } from '../../core/services/state.service';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';

/**
 * Das Segment Baum|XML ist gesperrt, wo es kein einzelnes XML gibt — und
 * erzwingt dort den Baum: sonst stuende "XML" aktiv, waehrend die Flaeche die
 * Kaskade zeigt.
 */
describe('Ortzeile — Darstellungssegment', () => {
  let fixture: ComponentFixture<Ortzeile>;
  let state: StateService;

  const knoepfe = (): HTMLButtonElement[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.darstellungSeg button',
      ),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Ortzeile] }).compileComponents();
    state = TestBed.inject(StateService);
    state.darstellung.set('baum');
    fixture = TestBed.createComponent(Ortzeile);
  });

  it('schaltet auf XML um', () => {
    state.root.set({ path: 'r', name: 'r' } as never);
    fixture.detectChanges();

    knoepfe()[1]!.click();
    fixture.detectChanges();

    expect(state.darstellung()).toBe('xml');
    expect(knoepfe()[1]!.classList).toContain('active');
  });

  it('sperrt ohne Nachricht und nennt den Grund an der Gruppe', () => {
    fixture.detectChanges();
    expect(knoepfe().every((b) => b.disabled)).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.darstellungSeg')
        ?.getAttribute('title'),
    ).toContain('Nachrichtentyp');
  });

  it('erzwingt den Baum, sobald mehrere Nachrichten ueberlagert sind', () => {
    state.root.set({ path: 'r', name: 'r' } as never);
    state.darstellung.set('xml');
    fixture.detectChanges();
    expect(state.darstellung()).toBe('xml');

    // `aktiv` ist ein computed (Property, kein Getter) — spyOnProperty greift
    // dort nicht; das Signal wird ersetzt und die Komponente neu gebaut.
    const ueberlagerung = TestBed.inject(UeberlagerungService);
    Object.defineProperty(ueberlagerung, 'aktiv', { value: signal(true), configurable: true });
    fixture = TestBed.createComponent(Ortzeile);
    fixture.detectChanges();

    expect(state.darstellung()).toBe('baum');
    expect(knoepfe().every((b) => b.disabled)).toBe(true);
  });

  it('erzwingt den Baum in der Datentyp-Ansicht', () => {
    state.root.set({ path: 'r', name: 'r' } as never);
    state.typName.set('Type.GDS.Beteiligung');
    state.darstellung.set('xml');
    fixture.detectChanges();

    expect(state.darstellung()).toBe('baum');
  });
});
