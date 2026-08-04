/**
 * Sperre der maschinellen Pruefartefakte bei Schema-Erweiterungen (#98).
 *
 * Eine Profilierung mit nachbeauftragten Elementen beschreibt einen Zustand,
 * den es im Schema noch nicht gibt. Testnachricht und Schematron wuerden
 * Gueltigkeit gegen eine XSD behaupten, die das Element per Definition nicht
 * kennt — beide sind darum gesperrt. Excel, Druck, Profil-Export und
 * Beispiel-XML bleiben frei: das sind Kommunikationsmittel fuer die AG, die den
 * Zielzustand zeigen duerfen; niemand validiert sie.
 */

/**
 * Begruendung im `title` der gesperrten Bedienelemente. Die Knoepfe bleiben
 * sichtbar und gesperrt statt unsichtbar — wer gerade eine Erweiterung angelegt
 * hat, sucht sein Profil sonst im Testdaten-Speicher und findet es nicht.
 */
export const ERW_SPERRE_GRUND =
  'Enthält Schema-Erweiterungen — nachbeauftragte Elemente ergeben keine gültige XJustiz-Nachricht.';

/**
 * Sperrkriterium: **jede** Erweiterung sperrt, unabhaengig vom Status. Es
 * entscheidet der Arbeitsstand (`LibraryEntry.nErw` bzw. `fortschritt().nErw`),
 * nicht die zu bindende Fassung.
 *
 * Bewusst grob: die Sperre ist eine Warnung, keine technische Feinabgrenzung.
 * Eine Regel nach Status oder je Fassung waere schwer erklaerbar und braeuchte
 * neue gespeicherte Kennzahlen. Alte Server-Zeilen ohne `nErw` gelten als frei.
 */
export function sperrtPruefartefakte(nErw: number | null | undefined): boolean {
  return (nErw ?? 0) > 0;
}

/**
 * Warnkommentar im Kopf des Beispiel-XML, damit die Datei nicht irrtuemlich als
 * Testnachricht weitergereicht wird. Die Versionsnummer stammt aus dem aktiven
 * Index; ohne geladenes Schema bleibt der Satz allgemein.
 */
export function erweiterungsWarnung(version: string): string {
  const wogegen = version ? `XJustiz ${version}` : 'das XJustiz-Schema';
  return `<!-- Enthält nachbeauftragte Elemente — gegen ${wogegen} nicht gültig. -->`;
}
