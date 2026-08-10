import { Directive } from '@angular/core';

/**
 * Unterbindet das automatische Ausfuellen in allen Texteingaben.
 *
 * Hintergrund: Die Seite traegt mit dem AG-Schluessel ein echtes
 * `type="password"`-Feld (Rollen-Badge in der Topbar). Safari deutet die frei
 * stehenden Eingaben deshalb als Anmeldeformular und prueft bei Fokus und
 * Tastendruck jedes Feld auf Kennung/Passwort. Im Baum-Editor einer
 * Testnachricht stehen hunderte Wertfelder — die Pruefung macht das Tippen
 * spuerbar traege. `autocomplete="off"` plus die Opt-outs der gaengigen
 * Passwortverwalter halten sie heraus.
 *
 * Der Element-Selektor greift automatisch, sobald die Direktive in den
 * `imports` einer Komponente steht; Datei-, Auswahl- und Passwortfelder bleiben
 * aussen vor (Letzteres regelt das Rollen-Badge selbst).
 */
@Directive({
  // Bewusst ein Element-Selektor statt des sonst ueblichen `[appXy]`: die Regel
  // soll fuer jede Texteingabe gelten, ohne sie an ueber dreissig Stellen
  // einzeln anzuschreiben.
  selector:
    // eslint-disable-next-line @angular-eslint/directive-selector
    'input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=password]), textarea',
  host: {
    autocomplete: 'off',
    'data-1p-ignore': '', // 1Password
    'data-lpignore': 'true', // LastPass
    'data-bwignore': 'true', // Bitwarden
    'data-form-type': 'other', // Dashlane
  },
})
export class KeinAutofillDirective {}
