import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';

describe('ToastService', () => {
  let toast: ToastService;
  let log: LoggerService;

  beforeEach(() => {
    spyOn(console, 'error');
    TestBed.configureTestingModule({});
    toast = TestBed.inject(ToastService);
    log = TestBed.inject(LoggerService);
  });

  it('showError zeigt die Error-Message und loggt den Fehler', () => {
    toast.showError(new Error('Backend weg'), 'Fallback');
    expect(toast.text()).toBe('Backend weg');
    const e = log.eintraege();
    expect(e.length).toBe(1);
    expect(e[0]!.level).toBe('error');
    expect(e[0]!.text).toBe('Fallback');
    expect(e[0]!.detail).toContain('Backend weg');
  });

  it('showError zeigt den Fallback bei Nicht-Error und loggt trotzdem', () => {
    toast.showError('irgendwas', 'Import fehlgeschlagen');
    expect(toast.text()).toBe('Import fehlgeschlagen');
    expect(log.eintraege()[0]!.detail).toBe('irgendwas');
  });

  it('fail-Callback zeigt den festen Text und loggt den uebergebenen Fehler', () => {
    const cb = toast.fail('Speichern fehlgeschlagen');
    cb(new Error('ECONNREFUSED'));
    expect(toast.text()).toBe('Speichern fehlgeschlagen');
    const e = log.eintraege();
    expect(e[0]!.text).toBe('Speichern fehlgeschlagen');
    expect(e[0]!.detail).toContain('ECONNREFUSED');
  });
});
