import { TestBed } from '@angular/core/testing';
import { UiSettingsService } from './ui-settings.service';

describe('UiSettingsService', () => {
  let ui: UiSettingsService;

  beforeEach(() => {
    localStorage.removeItem('xjp.ui.testFlagge');
    localStorage.removeItem('xjp.ui.testZahl');
    TestBed.configureTestingModule({});
    ui = TestBed.inject(UiSettingsService);
  });

  afterEach(() => {
    localStorage.removeItem('xjp.ui.testFlagge');
    localStorage.removeItem('xjp.ui.testZahl');
  });

  it('faellt ohne gespeicherten Wert auf die Vorgabe zurueck', () => {
    expect(ui.flagge('testFlagge', true)()).toBe(true);
    expect(ui.zahl('testZahl', null)()).toBeNull();
  });

  it('sichert jede Aenderung sofort', () => {
    const f = ui.flagge('testFlagge', false);
    f.set(true);
    expect(localStorage.getItem('xjp.ui.testFlagge')).toBe('ja');

    const z = ui.zahl('testZahl', null);
    z.set(480);
    expect(localStorage.getItem('xjp.ui.testZahl')).toBe('480');
  });

  it('liest den gesicherten Wert beim naechsten Zugriff wieder ein', () => {
    ui.flagge('testFlagge', false).set(true);
    ui.zahl('testZahl', null).set(480);

    // Zweiter Zugriff steht fuer den naechsten Sitzungsstart.
    expect(ui.flagge('testFlagge', false)()).toBe(true);
    expect(ui.zahl('testZahl', null)()).toBe(480);
  });

  it('behandelt die zurueckgesetzte Zahl als "nicht gesetzt"', () => {
    const z = ui.zahl('testZahl', null);
    z.set(480);
    z.set(null);

    expect(localStorage.getItem('xjp.ui.testZahl')).toBe('');
    expect(ui.zahl('testZahl', null)()).toBeNull();
  });

  it('sichert auch bei update()', () => {
    const f = ui.flagge('testFlagge', false);
    f.update((v) => !v);
    expect(f()).toBe(true);
    expect(localStorage.getItem('xjp.ui.testFlagge')).toBe('ja');
  });

  it('ueberlebt einen unlesbaren Wert im Speicher', () => {
    localStorage.setItem('xjp.ui.testZahl', 'kein-zahlwert');
    expect(ui.zahl('testZahl', null)()).toBeNull();
  });
});
