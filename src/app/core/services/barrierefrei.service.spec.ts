import { TestBed } from '@angular/core/testing';
import { BarrierefreiSchalter } from '../../shared/barrierefrei-schalter/barrierefrei-schalter';
import { BARRIEREFREI_KLASSE, BarrierefreiService } from './barrierefrei.service';

const SCHLUESSEL = 'xjp.ui.barrierefrei';

/**
 * Die barrierefreie Darstellung ist ein Wahlschalter: ohne ihn bleibt die
 * Oberflaeche, wie sie ist. Geprueft wird die eine Stelle, an der alles
 * haengt — die Klasse am `<html>`-Element — und dass die Wahl den Reload
 * uebersteht.
 */
describe('BarrierefreiService — Wahlschalter der Darstellung', () => {
  const wurzel = document.documentElement;

  const starte = (): BarrierefreiService => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(BarrierefreiService);
    TestBed.tick();
    return svc;
  };

  beforeEach(() => {
    localStorage.removeItem(SCHLUESSEL);
    wurzel.classList.remove(BARRIEREFREI_KLASSE);
  });

  afterEach(() => {
    localStorage.removeItem(SCHLUESSEL);
    wurzel.classList.remove(BARRIEREFREI_KLASSE);
  });

  it('ist ohne gespeicherte Wahl aus und laesst das Dokument unberuehrt', () => {
    const svc = starte();
    expect(svc.aktiv()).toBeFalse();
    expect(wurzel.classList).not.toContain(BARRIEREFREI_KLASSE);
    expect(svc.scrollVerhalten()).toBe('smooth');
  });

  it('setzt und entfernt die Klasse am html-Element und merkt sich die Wahl', () => {
    const svc = starte();
    svc.schalte();
    TestBed.tick();
    expect(wurzel.classList).toContain(BARRIEREFREI_KLASSE);
    expect(localStorage.getItem(SCHLUESSEL)).toBe('ja');
    expect(svc.scrollVerhalten()).toBe('auto');

    svc.schalte();
    TestBed.tick();
    expect(wurzel.classList).not.toContain(BARRIEREFREI_KLASSE);
    expect(localStorage.getItem(SCHLUESSEL)).toBe('nein');
  });

  it('stellt die gespeicherte Wahl beim Start wieder her', () => {
    localStorage.setItem(SCHLUESSEL, 'ja');
    const svc = starte();
    expect(svc.aktiv()).toBeTrue();
    expect(wurzel.classList).toContain(BARRIEREFREI_KLASSE);
  });

  it('der Schalter meldet seinen Zustand als role="switch" und schaltet per Klick', () => {
    starte();
    const fix = TestBed.createComponent(BarrierefreiSchalter);
    fix.detectChanges();
    const knopf = (fix.nativeElement as HTMLElement).querySelector('button')!;
    expect(knopf.getAttribute('role')).toBe('switch');
    expect(knopf.getAttribute('aria-checked')).toBe('false');

    knopf.click();
    fix.detectChanges();
    expect(knopf.getAttribute('aria-checked')).toBe('true');
    expect(wurzel.classList).toContain(BARRIEREFREI_KLASSE);
  });
});
