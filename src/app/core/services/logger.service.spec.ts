import { TestBed } from '@angular/core/testing';
import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let log: LoggerService;

  beforeEach(() => {
    spyOn(console, 'debug');
    spyOn(console, 'info');
    spyOn(console, 'warn');
    spyOn(console, 'error');
    TestBed.configureTestingModule({});
    log = TestBed.inject(LoggerService);
  });

  it('legt Eintraege mit Level, Quelle und Text im Puffer ab', () => {
    log.warn('Persistenz', 'Autosave fehlgeschlagen');
    const e = log.eintraege();
    expect(e.length).toBe(1);
    expect(e[0]!.level).toBe('warn');
    expect(e[0]!.quelle).toBe('Persistenz');
    expect(e[0]!.text).toBe('Autosave fehlgeschlagen');
    expect(e[0]!.detail).toBeUndefined();
  });

  it('rotiert den Ringpuffer bei mehr als 200 Eintraegen', () => {
    for (let i = 0; i < 210; i++) log.info('Test', `Eintrag ${i}`);
    const e = log.eintraege();
    expect(e.length).toBe(200);
    expect(e[0]!.text).toBe('Eintrag 10');
    expect(e[199]!.text).toBe('Eintrag 209');
  });

  it('serialisiert Error-Objekte mit Name, Message und Stack', () => {
    const err = new Error('kaputt');
    log.error('Global', 'Unbehandelter Fehler', err);
    const detail = log.eintraege()[0]!.detail!;
    expect(detail).toContain('Error: kaputt');
    if (err.stack) expect(detail).toContain(err.stack);
  });

  it('serialisiert sonstige Details als JSON', () => {
    log.debug('Test', 'Objekt', { a: 1 });
    expect(log.eintraege()[0]!.detail).toBe('{"a":1}');
  });

  it('spiegelt in die Konsole mit [xjp]-Praefix und rohem Detail', () => {
    const err = new Error('kaputt');
    log.error('XRepository', 'Abruf fehlgeschlagen', err);
    expect(console.error).toHaveBeenCalledWith('[xjp]', 'XRepository:', 'Abruf fehlgeschlagen', err);
    log.info('Test', 'ohne Detail');
    expect(console.info).toHaveBeenCalledWith('[xjp]', 'Test:', 'ohne Detail');
  });

  it('exportText enthaelt Kopf und Eintragszeilen mit eingerueckten Details', () => {
    log.error('Persistenz', 'Autosave fehlgeschlagen', new Error('offline'));
    const text = log.exportText();
    expect(text).toContain('XJustiz Profilierer — Fehlerprotokoll');
    expect(text).toContain(navigator.userAgent);
    expect(text).toContain('[ERROR] Persistenz: Autosave fehlgeschlagen');
    expect(text).toContain('    Error: offline');
  });

  it('registriert sich als Konsolen-Notzugang unter xjpLog', () => {
    expect((globalThis as Record<string, unknown>)['xjpLog']).toBe(log);
  });
});
