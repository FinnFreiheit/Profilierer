import { Injectable, signal } from '@angular/core';

/** Kurzmeldungen (toast, Profilierer.html Z.2334ff). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _text = signal('');
  readonly text = this._text.asReadonly();
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, ms = 2800): void {
    this._text.set(text);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this._text.set(''), ms);
  }

  /** Fehlermeldung: Error-Message des Auslösers, sonst der Fallback-Text. */
  showError(e: unknown, fallback: string): void {
    this.show(e instanceof Error ? e.message : fallback);
  }

  /** Fester Fehlertext als catch-Callback (z. B. Backend nicht erreichbar). */
  fail(msg: string): (e: unknown) => void {
    return () => this.show(msg);
  }
}
