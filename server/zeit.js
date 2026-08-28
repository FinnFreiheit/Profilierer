/**
 * Kalender-Hilfen der Nutzungszaehlung. Tage sind hier bewusst *lokale*
 * Kalendertage des Servers (Pi: Europe/Berlin) und keine UTC-Tage: die
 * Kennzahlen werden von Menschen gelesen, die "heute" meinen.
 *
 * Die Umrechnung passiert einmal in JS und wandert als Text 'YYYY-MM-DD' in
 * die DB -- nirgends `date(..., 'localtime')` in SQL. Sonst haengt die
 * Tagesgrenze an der Zeitzone des Prozesses, und Zeilen wandern beim
 * Sommerzeitwechsel zwischen Tagen.
 */

const zwei = (n) => String(n).padStart(2, '0');

/** Lokaler Kalendertag als 'YYYY-MM-DD'. */
export function lokalerTag(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** Beginn der lokalen Stunde, in die `ms` faellt (Unix-ms). */
export function stundenBeginn(ms = Date.now()) {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/**
 * Kalendertag um `delta` Tage verschoben. Rechnet ueber die Tagesmitte, damit
 * die Sommerzeit-Umstellung (23- bzw. 25-Stunden-Tage) keinen Tag verschluckt.
 */
export function tagPlus(tag, delta) {
  const [j, m, t] = tag.split('-').map(Number);
  const d = new Date(j, m - 1, t, 12, 0, 0, 0);
  d.setDate(d.getDate() + delta);
  return lokalerTag(d.getTime());
}

/** Liste der Kalendertage von `von` bis `bis` (beide einschliesslich). */
export function tagesSpanne(von, bis) {
  const tage = [];
  for (let t = von; t <= bis; t = tagPlus(t, 1)) tage.push(t);
  return tage;
}
