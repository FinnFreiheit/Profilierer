import { Injectable, WritableSignal, signal } from '@angular/core';

const PRAEFIX = 'xjp.ui.';

/**
 * Arbeitsplatz-Einstellungen der Oberflaeche (Issue #80/#81): Panelbreite,
 * eingeklappte Spalte, aufgeklappte Legende.
 *
 * Bewusst `localStorage` und nicht das Backend: diese Werte gehoeren zum
 * Bildschirm, an dem gearbeitet wird, nicht zur Profilierung — dieselbe
 * Profilierung darf am Notebook anders aussehen als am Beamer.
 */
@Injectable({ providedIn: 'root' })
export class UiSettingsService {
  /** Wahrheitswert, der jede Aenderung selbst sichert. */
  flagge(key: string, fallback: boolean): WritableSignal<boolean> {
    return this.gesichert(
      key,
      fallback,
      (roh) => roh === 'ja',
      (v) => (v ? 'ja' : 'nein'),
    );
  }

  /** Zahl mit `null` als "nicht gesetzt" (z.B. Panelbreite = Automatik). */
  zahl(key: string, fallback: number | null): WritableSignal<number | null> {
    return this.gesichert(
      key,
      fallback,
      (roh) => {
        const n = Number(roh);
        return roh === '' || Number.isNaN(n) ? null : n;
      },
      (v) => (v === null ? '' : String(v)),
    );
  }

  /**
   * Signal, dessen `set`/`update` zusaetzlich in den localStorage schreiben.
   * Das Ueberschreiben der beiden Methoden haelt die Nutzung im Template
   * unveraendert — ein zusaetzliches `effect` je Einstellung braeuchte einen
   * Injection-Kontext und liefe bei jeder Aenderung durch die Change Detection.
   */
  private gesichert<T>(
    key: string,
    fallback: T,
    lesen: (roh: string) => T,
    schreiben: (wert: T) => string,
  ): WritableSignal<T> {
    const roh = this.laden(key);
    const sig = signal<T>(roh === null ? fallback : lesen(roh));
    const set = sig.set.bind(sig);
    const update = sig.update.bind(sig);
    sig.set = (wert: T) => {
      set(wert);
      this.sichern(key, schreiben(wert));
    };
    sig.update = (fn: (alt: T) => T) => {
      update(fn);
      this.sichern(key, schreiben(sig()));
    };
    return sig;
  }

  /** Privater Modus und volle Quota duerfen die Oberflaeche nicht lahmlegen. */
  private laden(key: string): string | null {
    try {
      return localStorage.getItem(PRAEFIX + key);
    } catch {
      return null;
    }
  }

  private sichern(key: string, wert: string): void {
    try {
      localStorage.setItem(PRAEFIX + key, wert);
    } catch {
      // Einstellung bleibt fuer diese Sitzung erhalten, nur nicht darueber hinaus.
    }
  }
}
