import { openDb } from './db.js';

/**
 * Oeffnet eine Datenbank fuer einen Test und schliesst sie hinterher.
 *
 * Ohne das Schliessen leben die Handles samt ihrer vorbereiteten Statements bis
 * zum Prozessende; ihre Destruktoren laufen dann in der Abrissphase von Node.
 * Genau daran ist die CI am 26.08.17 zerbrochen — `better-sqlite3` 11.10 lief
 * unter Linux/Node 24.19 in `Assertion failed: (env) != nullptr`, obwohl alle
 * Assertions bestanden hatten (#123). Der Versionssprung auf 13 (#122) hat den
 * Ausloeser genommen; dass hier aufgeraeumt wird, nimmt die Ursache.
 *
 * `t.after` laeuft auch bei synchronen Tests und auch dann, wenn der Test
 * fehlschlaegt — das Aufraeumen haengt nicht am Erfolg.
 */
export function oeffneTestDb(t, pfad = ':memory:') {
  const db = openDb(pfad);
  t.after(() => db.close());
  return db;
}
