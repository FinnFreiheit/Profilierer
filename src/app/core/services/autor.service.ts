import { Injectable, signal } from '@angular/core';

/** Browser-Ablage der Selbstauskunft (frueher `xjp.hinweisAutor`, Issue #40). */
export const AUTOR_STORAGE = 'xjp.autor';

/** Vorgaenger-Schluessel; sein Wert wird beim ersten Zugriff uebernommen. */
const ALT_STORAGE = 'xjp.hinweisAutor';

/**
 * Die Selbstauskunft "wer bin ich" — **eine** Quelle fuer alle Stellen, an
 * denen ein Name an die Arbeit geschrieben wird: Hinweise am Element (#40) und
 * der Autor einer Testnachricht. Zwei getrennte Namensfragen an denselben
 * Menschen waeren Buerokratie ohne Gegenwert.
 *
 * Reine Selbstauskunft, kein Nachweis: das belastbare Rollenkennzeichen
 * stempelt der Server aus dem AG-Schluessel. Der Name ueberlebt den Reload im
 * Browser-Storage; ein Konto gibt es nicht.
 */
@Injectable({ providedIn: 'root' })
export class AutorService {
  /** Der gemerkte Name ('' = noch keiner hinterlegt). */
  readonly name = signal<string>(lies());

  /** Namen merken (leer = wieder fragen). */
  setze(eingabe: string): void {
    const clean = eingabe.trim();
    this.name.set(clean);
    if (clean) localStorage.setItem(AUTOR_STORAGE, clean);
    else localStorage.removeItem(AUTOR_STORAGE);
  }

  /**
   * Den Namen beschaffen: den gemerkten, sonst einmalig fragen. Gibt '' zurueck,
   * wenn die Abfrage abgebrochen oder leer bestaetigt wurde — der Aufrufer
   * bricht dann ab (die Angabe ist Pflicht, wo dieser Weg gegangen wird).
   */
  sicherstellen(): string {
    const bekannt = this.name();
    if (bekannt) return bekannt;
    const eingabe = prompt('Ihr Name — er erscheint als Autor an dem, was Sie anlegen:') ?? '';
    this.setze(eingabe);
    return this.name();
  }
}

/**
 * Gemerkten Namen lesen und den Altbestand einmalig uebernehmen: der Name lag
 * bis dahin allein an den Hinweisen (`xjp.hinweisAutor`) — niemand soll ihn ein
 * zweites Mal eintippen muessen.
 */
function lies(): string {
  const neu = localStorage.getItem(AUTOR_STORAGE);
  if (neu) return neu;
  const alt = localStorage.getItem(ALT_STORAGE) ?? '';
  if (alt) localStorage.setItem(AUTOR_STORAGE, alt);
  return alt;
}
