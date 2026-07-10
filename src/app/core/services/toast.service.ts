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
}
