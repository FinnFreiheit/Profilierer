import { ErrorHandler, Injectable, inject } from '@angular/core';
import { LoggerService } from './logger.service';

/**
 * Fängt unbehandelte Fehler (inkl. Promise-Rejections via
 * provideBrowserGlobalErrorListeners) und schreibt sie ins Fehlerprotokoll.
 * Kein eigenes console.error nötig — der Logger spiegelt bereits.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly log = inject(LoggerService);

  handleError(e: unknown): void {
    this.log.error('Global', 'Unbehandelter Fehler', e);
  }
}
