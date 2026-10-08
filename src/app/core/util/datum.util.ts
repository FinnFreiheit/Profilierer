/**
 * Datumsanzeige der Bibliotheks-Ansichten. Kacheln und Listenzeilen zeigen
 * ueberall dasselbe Format — zweistellig mit fuehrenden Nullen, sonst stuenden
 * "3.8.2026" und "24.07.2026" in derselben Spalte nebeneinander (#88/#91).
 *
 * Die Ansichten fuettern es aus verschiedenen Feldern: `aktualisiert` und
 * `hochgeladen` sind Zeitstempel, `gespeichert` ist ein ISO-Datum. Deshalb
 * nimmt die Funktion beides.
 */
export function datumKurz(wert: number | string | null | undefined): string {
  if (wert === null || wert === undefined || wert === '') return '';
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
