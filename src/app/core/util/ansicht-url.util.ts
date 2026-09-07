/**
 * Start-Ansicht aus der Adresszeile: `?ansicht=styleguide` oeffnet den
 * Styleguide statt der Uebersicht. Bewusst ein einzelner, benannter Wert und
 * keine freie Ansichtswahl — der Styleguide ist ein Entwicklerwerkzeug (Quelle
 * des Design-System-Spiegels, ADR 0022) ohne Reiter in der Oberflaeche; alle
 * anderen Ansichten erreicht man ueber die Bedienung, nicht ueber die URL.
 *
 * Reine Funktion ueber dem Query-String, damit sie ohne `location` testbar ist.
 */
export type StartAnsicht = 'styleguide';

export function ansichtAusUrl(search: string): StartAnsicht | null {
  return new URLSearchParams(search).get('ansicht') === 'styleguide' ? 'styleguide' : null;
}
