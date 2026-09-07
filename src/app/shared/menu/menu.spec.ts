import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Menu, menuLinkeKante } from './menu';

/**
 * Die Lage des Panels ist reine Rechnung — im Test ohne Layout pruefbar
 * (gemessene Rechtecke waeren in der Testumgebung ohnehin 0). Der Fall, um den
 * es geht: rechtsbuendig muss gegen die **tatsaechliche** Panelbreite gerechnet
 * werden, nicht gegen die konfigurierte Obergrenze — sonst haengt ein schmales
 * Menue sichtbar links neben seinem Knopf.
 */
describe('menuLinkeKante', () => {
  const knopf = { left: 700, right: 800 };

  it('legt rechtsbuendig die rechte Kante des Panels auf die des Knopfes', () => {
    expect(menuLinkeKante(knopf, 320, 'rechts', 1200)).toBe(480);
    // Schmaler Inhalt: die Kante wandert mit, das Panel bleibt am Knopf.
    expect(menuLinkeKante(knopf, 160, 'rechts', 1200)).toBe(640);
  });

  it('legt linksbuendig die linke Kante auf die des Knopfes', () => {
    expect(menuLinkeKante(knopf, 320, 'links', 1200)).toBe(700);
  });

  it('klemmt links wie rechts am Fensterrand', () => {
    // Rechtsbuendig an einem Knopf ganz links: nicht ins Negative.
    expect(menuLinkeKante({ left: 10, right: 60 }, 320, 'rechts', 1200)).toBe(8);
    // Linksbuendig an einem Knopf ganz rechts: das Panel bleibt im Fenster.
    expect(menuLinkeKante({ left: 1150, right: 1190 }, 320, 'links', 1200)).toBe(872);
  });
});

/**
 * Der Schliess-Backdrop liegt im DOM **innerhalb** des Wirts, in dem das Menue
 * steht — und der ist in den Bibliotheks-Ansichten selbst anklickbar (Kachel,
 * Listenzeile, Szenario-Kopf). Ohne `stopPropagation` schloss "daneben klicken"
 * zwar das Menue, oeffnete aber zugleich den Eintrag darunter.
 */
describe('Menu — Backdrop-Klick', () => {
  @Component({
    selector: 'app-menu-wirt',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [Menu],
    // Wie die echte Kachel: klickbar und mit der Tastatur erreichbar
    // (`tabindex`/`keydown`) — sonst zaehlte der Wirt zwei neue Lint-Warnungen.
    template: `<div
      class="dashCard"
      tabindex="0"
      (click)="geoeffnet.set(geoeffnet() + 1)"
      (keydown)="geoeffnet.set(geoeffnet() + 1)"
    >
      <app-menu label="⋯" [pfeil]="false"><button class="menuItem">Löschen</button></app-menu>
    </div>`,
  })
  class Wirt {
    readonly geoeffnet = signal(0);
  }

  let fixture: ComponentFixture<Wirt>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Wirt] }).compileComponents();
    fixture = TestBed.createComponent(Wirt);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('app-menu > button')!.click();
    fixture.detectChanges();
  });

  it('schliesst das Menue, ohne die Kachel darunter zu oeffnen', () => {
    expect(el.querySelector('.menuPanel')).toBeTruthy();
    // Der Klick auf den Knopf selbst darf die Kachel schon nicht oeffnen.
    expect(fixture.componentInstance.geoeffnet()).toBe(0);

    el.querySelector<HTMLElement>('.menuBackdrop')!.click();
    fixture.detectChanges();

    expect(el.querySelector('.menuPanel')).toBeNull();
    expect(fixture.componentInstance.geoeffnet()).toBe(0);
  });
});
