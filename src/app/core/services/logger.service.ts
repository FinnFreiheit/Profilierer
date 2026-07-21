import { Injectable } from '@angular/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Ein Eintrag im Ringpuffer; `detail` ist die serialisierte Form des Fehlerobjekts. */
export interface LogEintrag {
  ts: number;
  level: LogLevel;
  quelle: string;
  text: string;
  detail?: string;
}

/** Maximale Puffergröße — älteste Einträge fallen heraus. */
const MAX_EINTRAEGE = 200;

/**
 * Zentraler Logger: spiegelt jede Meldung in die Browser-Konsole (rohes
 * Fehlerobjekt, damit der Stacktrace klickbar bleibt) und hält die letzten
 * Einträge in einem Ringpuffer, der als Fehlerprotokoll exportiert werden
 * kann. Bewusst ohne Dependencies, damit ihn ToastService/ErrorHandler/Stores
 * zyklusfrei nutzen können.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly puffer: LogEintrag[] = [];

  constructor() {
    // Notzugang aus der Browser-Konsole (xjpLog.exportText()), falls die UI selbst kaputt ist.
    (globalThis as Record<string, unknown>)['xjpLog'] = this;
  }

  debug(quelle: string, text: string, detail?: unknown): void {
    this.log('debug', quelle, text, detail);
  }

  info(quelle: string, text: string, detail?: unknown): void {
    this.log('info', quelle, text, detail);
  }

  warn(quelle: string, text: string, detail?: unknown): void {
    this.log('warn', quelle, text, detail);
  }

  error(quelle: string, text: string, detail?: unknown): void {
    this.log('error', quelle, text, detail);
  }

  eintraege(): readonly LogEintrag[] {
    return this.puffer;
  }

  /** Fehlerprotokoll als lesbarer Text (für Bugreports/Download). */
  exportText(): string {
    const kopf = [
      'XJustiz Profilierer — Fehlerprotokoll',
      `Erstellt:   ${new Date().toISOString()}`,
      `Seite:      ${location.href}`,
      `User-Agent: ${navigator.userAgent}`,
      '',
    ];
    const zeilen = this.puffer.map((e) => {
      const kopfzeile = `${new Date(e.ts).toISOString()} [${e.level.toUpperCase()}] ${e.quelle}: ${e.text}`;
      if (!e.detail) return kopfzeile;
      const detail = e.detail
        .split('\n')
        .map((z) => '    ' + z)
        .join('\n');
      return kopfzeile + '\n' + detail;
    });
    return kopf.concat(zeilen).join('\n') + '\n';
  }

  private log(level: LogLevel, quelle: string, text: string, detail?: unknown): void {
    const eintrag: LogEintrag = { ts: Date.now(), level, quelle, text };
    if (detail !== undefined) eintrag.detail = this.serialisiere(detail);
    this.puffer.push(eintrag);
    if (this.puffer.length > MAX_EINTRAEGE) this.puffer.splice(0, this.puffer.length - MAX_EINTRAEGE);
    if (detail !== undefined) console[level]('[xjp]', quelle + ':', text, detail);
    else console[level]('[xjp]', quelle + ':', text);
  }

  private serialisiere(d: unknown): string {
    if (d instanceof Error) return `${d.name}: ${d.message}` + (d.stack ? '\n' + d.stack : '');
    if (typeof d === 'string') return d;
    try {
      return JSON.stringify(d);
    } catch {
      return String(d);
    }
  }
}
