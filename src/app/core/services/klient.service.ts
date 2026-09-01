import { Injectable } from '@angular/core';

/** Browser-Storage-Schluessel der anonymen Klient-Kennung. */
export const KLIENT_STORAGE = 'xjp.klientId';

/**
 * Anonyme Kennung dieses Browsers fuer die Nutzungszaehlung (#kennzahlen).
 *
 * Eine Zufalls-UUID, einmal erzeugt und im Storage gemerkt — kein Name, keine
 * Anmeldung, keine IP. Sie geht als Header `x-klient` an jeden API-Request und
 * beantwortet serverseitig genau eine Frage: waren das zehn Zugriffe von einem
 * Browser oder von zehn? Gezaehlt werden damit Browser-Profile, nicht Personen:
 * geleerter Speicher, zweiter Browser oder privates Fenster ergeben eine neue
 * Kennung (steht so auch in der Ansicht).
 */
@Injectable({ providedIn: 'root' })
export class KlientService {
  readonly id = hole();

  /** Kennungs-Header fuer API-Zugriffe. */
  header(): Record<string, string> {
    return { 'x-klient': this.id };
  }
}

function erzeuge(): string {
  // randomUUID gibt es nur im sicheren Kontext (https/localhost); sonst reicht
  // uns eine Zufallsfolge in derselben Form.
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function hole(): string {
  // Privates Fenster/gesperrter Storage: dann lebt die Kennung nur in diesem
  // Tab. Die Zaehlung darf daran nicht scheitern.
  try {
    const gemerkt = localStorage.getItem(KLIENT_STORAGE);
    if (gemerkt) return gemerkt;
    const neu = erzeuge();
    localStorage.setItem(KLIENT_STORAGE, neu);
    return neu;
  } catch {
    return erzeuge();
  }
}
