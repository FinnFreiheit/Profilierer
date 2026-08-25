import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { toEntry, zaehleFortschritt } from './fortschritt.js';
import { normalisiereTags } from './tags.js';

/** Wie viele Automatik-Versionen (Oeffnen-Snapshot, Sicherheits-Version) je Profil bleiben. */
const AUTO_DECKEL = 10;

/**
 * Schema-Version (PRAGMA user_version), ab der die Hinweise in eigener Ablage
 * liegen. Spaltenzuwaechse laufen weiter ueber PRAGMA table_info; die Nummer
 * steuert nur einmalige Daten-Umstellungen.
 */
const SCHEMA_HINWEISE = 1;

/**
 * Hash ueber den gespeicherten doc-String — Grundlage fuer "geaendert seit vX"
 * und die Entprellung der Automatik-Versionen. Bewusst ueber die Serialisierung
 * (nicht semantisch): anders serialisierte, gleiche Staende gelten als
 * "geaendert" — falsch-positiv ist hier harmlos.
 */
const docHash = (s) => createHash('sha1').update(s).digest('hex');

/**
 * Kanonische Serialisierung eines Profil-Dokuments: Objektschluessel sortiert.
 * Grundlage des Fach-Hashs, der zwei Profil-Staende auf ihre *Aussage* hin
 * vergleicht — anders als docHash, der bewusst an der Serialisierung haengt.
 */
function kanonisch(v) {
  if (Array.isArray(v)) return '[' + v.map(kanonisch).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .sort()
        .filter((k) => v[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + kanonisch(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v) ?? 'null';
}

/**
 * Hash ueber die fachliche Aussage eines Profil-Dokuments — Grundlage des
 * Kennzeichens "Profil weiterentwickelt" an einer gebundenen Testnachricht.
 * `meta.gespeichert` bleibt aussen vor: das Feld wird bei jedem Speichern neu
 * gesetzt und wuerde sonst jede gebundene Nachricht mit einer Schein-Aenderung
 * markieren (dieselbe Auslassung trifft der Profil-Vergleich im Frontend, der
 * die konkreten Unterschiede zeigt — Badge und Liste muessen sich einig sein).
 * Listen-Reihenfolgen (Statusstufen, Auspraegungen) zaehlen mit: eine
 * Umsortierung setzt das Badge, ohne dass der Vergleich eine Zeile ausweist —
 * sie ist eine Aenderung der Profilierung, nur eine, die der Vergleich (noch)
 * nicht benennt.
 */
/**
 * Tagesdatum in der Schreibweise der Fassungsbezeichnung ("Arbeitsstand vom
 * 22.08.2026"). Bewusst von Hand statt `toLocaleDateString`: die Bezeichnung
 * bleibt als Text am Eintrag stehen und soll unabhaengig von der
 * ICU-Ausstattung des Servers dieselbe Form haben wie die im Client vergebene
 * (`TestmessageCreateService.ladeFassung`).
 */
function datumDe(ts) {
  const d = new Date(ts);
  const zwei = (n) => String(n).padStart(2, '0');
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fachHash(doc) {
  let d = doc;
  if (d && typeof d === 'object' && d.meta && typeof d.meta === 'object') {
    const meta = { ...d.meta };
    delete meta.gespeichert;
    // Schlagworte sind eine Ablage-Hilfe, keine fachliche Festlegung: wer eine
    // freigegebene Profilierung nachtraeglich einsortiert, soll damit weder die
    // Freigabe entwerten noch gebundene Testnachrichten als "Profil
    // weiterentwickelt" markieren.
    delete meta.tags;
    d = { ...d, meta };
  }
  // `fortschritt` ist eine abgeleitete Zaehlung, keine fachliche Aussage (#93):
  // schon ein Wechsel der Schemaversion aendert den Nenner und markierte sonst
  // jede gebundene Testnachricht als "Profil weiterentwickelt".
  if (d && typeof d === 'object' && 'fortschritt' in d) {
    d = { ...d };
    delete d.fortschritt;
  }
  return docHash(kanonisch(d));
}

/**
 * Loest die alten Hinweisfelder (`hinweis`/`hinweisErledigt` am Elementprofil)
 * aus einem Profil-Dokument heraus — in-place. Zwei Aufgaben in einer Funktion,
 * damit Migration und Einliefer-Schutz dieselbe Regel benutzen: Einliefern
 * verwirft die Ausbeute, die Migration macht Listeneintraege daraus.
 * Eintraege, die dadurch leer werden, fallen weg (pruneP-Aequivalent).
 * Gibt die gefundenen Hinweise als [{ pfad, text, erledigt }] zurueck.
 */
function hinweiseHerausloesen(doc) {
  const gefunden = [];
  const elemente = doc && typeof doc === 'object' ? doc.elemente : null;
  if (!elemente || typeof elemente !== 'object') return gefunden;
  for (const [pfad, p] of Object.entries(elemente)) {
    if (!p || typeof p !== 'object') continue;
    if (!('hinweis' in p) && !('hinweisErledigt' in p)) continue;
    const text = typeof p.hinweis === 'string' ? p.hinweis.trim() : '';
    const erledigt = !!p.hinweisErledigt;
    delete p.hinweis;
    delete p.hinweisErledigt;
    if (text) gefunden.push({ pfad, text, erledigt });
    if (!Object.keys(p).length) delete elemente[pfad];
  }
  return gefunden;
}

/**
 * Spalten der schlanken Testnachrichten-Zeile (ohne xml/entscheidungen/vorgabe).
 * `profil_weiterentwickelt`: die gebundene Fassung sagt fachlich etwas anderes
 * als der aktuelle Stand der Profilierung — Grundlage des Kachel-Badges. Ohne
 * Bindung, ohne eingefrorene Kopie und nach dem Loeschen der Profilierung (kein
 * `fach_hash` zu vergleichen) bleibt es aus; ein positives "profilkonform" gibt
 * es bewusst nicht.
 */
const TM_COLS = `t.id, t.name, t.nachricht, t.fachmodul, t.xjustiz_version, t.groesse, t.notiz, t.tags,
              t.hochgeladen, t.aktualisiert, t.entwurf, t.fortschritt,
              (t.entscheidungen IS NOT NULL) AS gefuehrt,
              t.abnahme_ts, t.abnahme_kommentar, (t.abnahme_xml IS NOT NULL) AS abgenommen,
              (t.abnahme_xml IS NOT NULL AND t.xml != t.abnahme_xml) AS geaendert_seit_abnahme,
              t.profil_id, t.profil_name, t.fassung,
              COALESCE(t.projekt_id, p.projekt_id) AS projekt_id,
              (t.vorgabe_hash IS NOT NULL AND p.fach_hash IS NOT NULL
               AND p.fach_hash != t.vorgabe_hash) AS profil_weiterentwickelt`;

/** Bindung an die (moeglicherweise geloeschte) Profilierung — daher LEFT JOIN. */
const TM_FROM = 'FROM testmessages t LEFT JOIN profiles p ON p.id = t.profil_id';

/**
 * SQLite-Zugriffsschicht der Profil-Bibliothek. Eine Tabelle `profiles`: das
 * komplette ProfileDoc als JSON-Spalte `doc`, daneben die abgeleiteten
 * Index-Spalten (Name/Nachricht/Version/Fortschritt/Zeitstempel), aus denen die
 * schlanke LibraryEntry-Liste ohne Deserialisierung der grossen doc-Maps
 * gerendert wird.
 *
 * `openDb(path)` ist eine Fabrik (kein Singleton), damit Tests eine
 * In-Memory-DB (':memory:') nutzen koennen.
 */
export function openDb(path) {
  if (path && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path || ':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      doc TEXT NOT NULL,
      name TEXT,
      nachricht TEXT,
      xjustiz_version TEXT,
      n_status INTEGER,
      n_ausp INTEGER,
      gespeichert TEXT,
      aktualisiert INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_aktualisiert ON profiles(aktualisiert DESC);

    CREATE TABLE IF NOT EXISTS profile_versions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      nr INTEGER NOT NULL,       -- fortlaufend je Profil, wird nie recycelt
      kommentar TEXT,
      automatisch INTEGER,       -- 1 = Oeffnen-Snapshot/Sicherheits-Version (gedeckelt)
      doc TEXT NOT NULL,         -- eingefrorener ProfileDoc-String (verbatim aus profiles.doc)
      doc_hash TEXT,
      erstellt INTEGER,
      UNIQUE(profile_id, nr)
    );
    CREATE INDEX IF NOT EXISTS idx_profile_versions_profil ON profile_versions(profile_id, nr DESC);

    -- Hinweise (Rueckmeldungen am Element) liegen bewusst NEBEN dem Profil-
    -- Dokument: im Dokument wuerde sie der naechste Autosave eines anderen
    -- Bearbeiters (PUT des Volldokuments aus einem aelteren Browser-Stand)
    -- lautlos loeschen, und der Abnahme-Hash reagierte auf jede Notiz.
    -- autor/rolle bleiben bis zur Autorschafts-Story leer (Altbestand: NULL).
    CREATE TABLE IF NOT EXISTS hinweise (
      id TEXT PRIMARY KEY,
      profil_id TEXT NOT NULL,
      pfad TEXT NOT NULL,
      text TEXT NOT NULL,
      autor TEXT,
      rolle TEXT,                -- 'ag' | 'extern' | NULL
      zeit INTEGER,
      erledigt INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hinweise_profil ON hinweise(profil_id);

    CREATE TABLE IF NOT EXISTS testmessages (
      id TEXT PRIMARY KEY,
      xml TEXT NOT NULL,
      name TEXT,             -- Dateiname/Anzeigename
      nachricht TEXT,        -- voller Name, z. B. nachricht.dabag.antrag.2900001
      fachmodul TEXT,        -- Cluster-Segment (z. B. dabag)
      xjustiz_version TEXT,  -- best-effort aus dem XML, optional
      groesse INTEGER,       -- Byte-Länge des XML
      notiz TEXT,
      hochgeladen INTEGER,
      aktualisiert INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_testmessages_fachmodul ON testmessages(fachmodul);

    -- Projekte (#134): der Behaelter ueber den Profilierungen. Ein Vorhaben wie
    -- GenUVA buendelt mehrere Kommunikationsszenarien auf derselben Nachricht;
    -- dafuer gab es bisher keine Ordnung -- das Fachmodul ist nur aus dem
    -- Nachrichtennamen abgeleitet, Schlagworte sind ein Querschnitt ohne
    -- Innenleben. Bewusst ohne Fremdschluessel: die Zuordnung ist Ablage, sie
    -- soll das Loeschen eines Projekts ueberleben (siehe prjDelete).
    -- Von xjustiz.de geholte Schemaversionen: einmal abgerufen, bleiben sie
    -- neben den im Projekt hinterlegten Kopien (public/schemas/) liegen. Vorher
    -- lebten sie nur im Speicher des Browsers und waren nach dem Neuladen weg --
    -- eine soeben veroeffentlichte Version (4.1.0) verschwand also staendig aus
    -- dem Umschalter. Aktualisiert wird ausschliesslich auf Zuruf.
    -- Die XSD-Dateien liegen je Version in schema_files (ein ZIP ~3 MB).
    CREATE TABLE IF NOT EXISTS schemas (
      id TEXT PRIMARY KEY,   -- Versionsnummer, z. B. "4.1.0"
      label TEXT,            -- Anzeigename im Umschalter
      hinweis TEXT,          -- Linktext der Versionsseite von xjustiz.de
      zip_url TEXT,          -- Bezugsquelle (Pfad relativ zu xjustiz.justiz.de)
      geholt INTEGER         -- Zeitpunkt des Abrufs
    );
    CREATE TABLE IF NOT EXISTS schema_files (
      schema_id TEXT NOT NULL,
      name TEXT NOT NULL,    -- flacher Dateiname (die XSDs importieren sich ohne Pfad)
      text TEXT NOT NULL,
      PRIMARY KEY (schema_id, name)
    );

    CREATE TABLE IF NOT EXISTS projekte (
      id TEXT PRIMARY KEY,
      name TEXT,
      beschreibung TEXT,
      tags TEXT,            -- JSON-Array, wie an Profil und Testnachricht
      angelegt INTEGER,
      aktualisiert INTEGER
    );
  `);

  // Migration: Spalten der gefuehrten Testnachricht-Erstellung nachziehen
  // (entwurf-Kennzeichen, Fortschritt "x von y" als JSON, Entscheidungsstand).
  {
    const cols = new Set(
      db
        .prepare('PRAGMA table_info(testmessages)')
        .all()
        .map((c) => c.name),
    );
    if (!cols.has('entwurf')) db.exec('ALTER TABLE testmessages ADD COLUMN entwurf INTEGER');
    if (!cols.has('fortschritt')) db.exec('ALTER TABLE testmessages ADD COLUMN fortschritt TEXT');
    if (!cols.has('entscheidungen'))
      db.exec('ALTER TABLE testmessages ADD COLUMN entscheidungen TEXT');
    // Leichtgewichtiger Abnahme-Stand (BLK-AG): eingefrorene XML-Fassung,
    // Zeitstempel, optionaler Kommentar — bewusst ohne Versionsapparat.
    if (!cols.has('abnahme_xml')) db.exec('ALTER TABLE testmessages ADD COLUMN abnahme_xml TEXT');
    if (!cols.has('abnahme_ts')) db.exec('ALTER TABLE testmessages ADD COLUMN abnahme_ts INTEGER');
    if (!cols.has('abnahme_kommentar'))
      db.exec('ALTER TABLE testmessages ADD COLUMN abnahme_kommentar TEXT');
    // Profil-Bindung: Herkunft (id/Name/Fassung) und die eingefrorene Kopie der
    // gebundenen Profilfassung. Bewusst ohne Fremdschluessel auf profiles —
    // die Kopie muss das Loeschen der Profilierung ueberleben.
    if (!cols.has('profil_id')) db.exec('ALTER TABLE testmessages ADD COLUMN profil_id TEXT');
    if (!cols.has('profil_name')) db.exec('ALTER TABLE testmessages ADD COLUMN profil_name TEXT');
    if (!cols.has('fassung')) db.exec('ALTER TABLE testmessages ADD COLUMN fassung TEXT');
    if (!cols.has('vorgabe')) db.exec('ALTER TABLE testmessages ADD COLUMN vorgabe TEXT');
    // Fach-Hash der eingefrorenen Kopie — Vergleichsbasis fuer das Kennzeichen
    // "Profil weiterentwickelt" ohne Deserialisieren der (grossen) Kopie.
    if (!cols.has('vorgabe_hash')) db.exec('ALTER TABLE testmessages ADD COLUMN vorgabe_hash TEXT');
    // Bezeichnungen benannter Vorkommen (JSON: Listen-Schluessel -> Namen in
    // Vorkommen-Reihenfolge). Sie haben im XJustiz-XML keine Entsprechung und
    // gingen beim Bearbeiten sonst verloren. Bewusst NICHT in `entscheidungen`:
    // aus dessen Vorhandensein leitet TM_COLS `gefuehrt` ab — jede bearbeitete
    // Nachricht truege sonst Badge und Fortsetzen-Aktion des gefuehrten Wegs.
    if (!cols.has('bezeichnungen'))
      db.exec('ALTER TABLE testmessages ADD COLUMN bezeichnungen TEXT');
    // Schlagworte als JSON-Array. Bewusst keine eigene Tabelle: die Liste ist
    // kurz, wird immer ganz gelesen und ganz geschrieben, und der Filter
    // arbeitet im Client auf dem ohnehin geladenen Index.
    if (!cols.has('tags')) db.exec('ALTER TABLE testmessages ADD COLUMN tags TEXT');
    // Eigene Projektzuordnung (#134). Gebundene Nachrichten **erben** das
    // Projekt ihrer Profilierung (COALESCE in TM_COLS); diese Spalte traegt nur
    // den Fall ohne Bindung -- Uploads -- und den Rest einer geloesten Bindung.
    if (!cols.has('projekt_id')) db.exec('ALTER TABLE testmessages ADD COLUMN projekt_id TEXT');
  }

  // Migration: Urheber-Merkmal am Hinweis (Issue #42). Wer einen Hinweis ohne
  // AG-Schluessel anlegt, bekommt ein Geheimnis zurueck und darf damit **seinen
  // eigenen** Eintrag in derselben Sitzung noch aendern oder loeschen. Die id
  // allein taugt dafuer nicht: die Liste ist fuer alle lesbar.
  {
    const cols = new Set(
      db
        .prepare('PRAGMA table_info(hinweise)')
        .all()
        .map((c) => c.name),
    );
    if (!cols.has('token')) db.exec('ALTER TABLE hinweise ADD COLUMN token TEXT');
  }

  // Migration: Index-Spalte fuer Schema-Erweiterungen (Dashboard-Badge) nachziehen.
  {
    const cols = new Set(
      db
        .prepare('PRAGMA table_info(profiles)')
        .all()
        .map((c) => c.name),
    );
    if (!cols.has('n_erw')) db.exec('ALTER TABLE profiles ADD COLUMN n_erw INTEGER');
    // Stand der Entscheidungspunkte fuer den Fortschrittsbalken (#93). Bleibt
    // im Altbestand leer, bis der naechste Autosave die Zahlen mitschreibt.
    if (!cols.has('n_entschieden'))
      db.exec('ALTER TABLE profiles ADD COLUMN n_entschieden INTEGER');
    if (!cols.has('n_punkte')) db.exec('ALTER TABLE profiles ADD COLUMN n_punkte INTEGER');
    if (!cols.has('doc_hash')) db.exec('ALTER TABLE profiles ADD COLUMN doc_hash TEXT');
    if (!cols.has('fach_hash')) db.exec('ALTER TABLE profiles ADD COLUMN fach_hash TEXT');
    // Autor, Beschreibung und Schlagworte stehen auf der Kachel; sie liegen im
    // Dokument, werden aber wie Name/Nachricht als Index-Spalte gefuehrt —
    // sonst muesste die Liste jedes doc deserialisieren.
    if (!cols.has('autor')) db.exec('ALTER TABLE profiles ADD COLUMN autor TEXT');
    if (!cols.has('beschreibung')) db.exec('ALTER TABLE profiles ADD COLUMN beschreibung TEXT');
    if (!cols.has('tags')) db.exec('ALTER TABLE profiles ADD COLUMN tags TEXT');
    // Projektzuordnung (#134). Sie liegt in der Spalte, nicht im ProfileDoc:
    // anders als die Schlagworte ist sie keine Eigenschaft des Dokuments,
    // sondern eine Kante zwischen zwei Zeilen -- und eine eingefrorene Version
    // soll die Zuordnung des Originals nicht konservieren.
    if (!cols.has('projekt_id')) db.exec('ALTER TABLE profiles ADD COLUMN projekt_id TEXT');
    // Abnahme durch die BLK-AG: Referenz auf die eingefrorene Abnahme-Version.
    if (!cols.has('abnahme_version_id'))
      db.exec('ALTER TABLE profiles ADD COLUMN abnahme_version_id TEXT');
  }

  // Migration: Abnahme-Kennzeichen an den Versionen (1 = durch Abnahme entstanden).
  {
    const cols = new Set(
      db
        .prepare('PRAGMA table_info(profile_versions)')
        .all()
        .map((c) => c.name),
    );
    if (!cols.has('abnahme')) db.exec('ALTER TABLE profile_versions ADD COLUMN abnahme INTEGER');
    // Fach-Hash der eingefrorenen Fassung: Vergleichsbasis von "geaendert seit
    // Freigabe". Der doc_hash taugt dafuer nicht — er haengt an der
    // Serialisierung, und schon das blosse Oeffnen schreibt abgeleitete Felder
    // (`fortschritt`) nach, ohne dass sich fachlich etwas geaendert haette.
    if (!cols.has('fach_hash')) db.exec('ALTER TABLE profile_versions ADD COLUMN fach_hash TEXT');
  }

  // Migration: n_erw fuer Alt-Bestand nachziehen. Ohne die Zahl blieben Zeilen,
  // die vor der Spalte gespeichert wurden, ohne Erweiterungs-Kennzeichen — und
  // damit an der Sperre der Pruefartefakte (#98) vorbei, obwohl sie
  // nachbeauftragte Elemente enthalten.
  {
    const offen = db.prepare('SELECT id, doc FROM profiles WHERE n_erw IS NULL').all();
    if (offen.length) {
      const set = db.prepare('UPDATE profiles SET n_erw = ? WHERE id = ?');
      db.transaction(() => {
        for (const r of offen) set.run(zaehleFortschritt(JSON.parse(r.doc)).nErw, r.id);
      })();
    }
  }

  // Migration: doc_hash fuer Alt-Bestand nachziehen (Vergleichsbasis der Versionen).
  {
    const offen = db.prepare('SELECT id, doc FROM profiles WHERE doc_hash IS NULL').all();
    if (offen.length) {
      const set = db.prepare('UPDATE profiles SET doc_hash = ? WHERE id = ?');
      db.transaction(() => {
        for (const r of offen) set.run(docHash(r.doc), r.id);
      })();
    }
  }

  // Migration: Autor, Beschreibung und Schlagworte aus den Dokumenten in die
  // Index-Spalten heben. Ohne den Lauf blieben die Kacheln des Altbestands leer,
  // bis das Profil das naechste Mal gespeichert wird. Gescannt wird nur, was
  // noch nichts davon traegt — Zeilen ohne diese Angaben kosten je Start einen
  // JSON-Parse, was bei der Groessenordnung der Bibliothek nicht ins Gewicht
  // faellt und dafuer ohne Schema-Zaehler auskommt.
  {
    const offen = db
      .prepare(
        'SELECT id, doc FROM profiles WHERE autor IS NULL AND beschreibung IS NULL AND tags IS NULL',
      )
      .all();
    if (offen.length) {
      const set = db.prepare(
        'UPDATE profiles SET autor = @autor, beschreibung = @beschreibung, tags = @tags WHERE id = @id',
      );
      db.transaction(() => {
        for (const r of offen) {
          let meta = {};
          try {
            meta = JSON.parse(r.doc)?.meta ?? {};
          } catch {
            continue;
          }
          const tags = normalisiereTags(meta.tags);
          set.run({
            id: r.id,
            autor: (meta.autor || '').trim() || null,
            beschreibung: (meta.beschreibung || '').trim() || null,
            tags: tags.length ? JSON.stringify(tags) : null,
          });
        }
      })();
    }
  }

  // Migration: Fach-Hashes nachziehen — an den Profilen und an den bereits
  // gebundenen Testnachrichten. Ohne sie bliebe das Kennzeichen "Profil
  // weiterentwickelt" an Alt-Bestand stumm.
  {
    const offen = db.prepare('SELECT id, doc FROM profiles WHERE fach_hash IS NULL').all();
    if (offen.length) {
      const set = db.prepare('UPDATE profiles SET fach_hash = ? WHERE id = ?');
      db.transaction(() => {
        for (const r of offen) set.run(fachHash(JSON.parse(r.doc)), r.id);
      })();
    }
    const ver = db.prepare('SELECT id, doc FROM profile_versions WHERE fach_hash IS NULL').all();
    if (ver.length) {
      const set = db.prepare('UPDATE profile_versions SET fach_hash = ? WHERE id = ?');
      db.transaction(() => {
        for (const r of ver) set.run(fachHash(JSON.parse(r.doc)), r.id);
      })();
    }
    const tm = db
      .prepare(
        'SELECT id, vorgabe FROM testmessages WHERE vorgabe IS NOT NULL AND vorgabe_hash IS NULL',
      )
      .all();
    if (tm.length) {
      const set = db.prepare('UPDATE testmessages SET vorgabe_hash = ? WHERE id = ?');
      db.transaction(() => {
        for (const r of tm) set.run(fachHash(JSON.parse(r.vorgabe)), r.id);
      })();
    }
  }

  /**
   * DB-Zeile einer gespeicherten Schemaversion -> BundledVersion des Clients.
   * `dir` traegt die Herkunft im Schluessel (wie beim Abruf von xjustiz.de),
   * damit der Umschalter eine gespeicherte Version nicht mit der hinterlegten
   * gleichen Namens verwechselt.
   */
  function schemaZeile(r, files) {
    return {
      id: r.id,
      label: r.label || r.id,
      dir: `xjustiz.de/${r.id}`,
      files,
      zipUrl: r.zip_url || undefined,
      hinweis: r.hinweis || undefined,
      geholt: r.geholt ?? null,
    };
  }

  const stmt = {
    list: db.prepare(
      `SELECT profiles.id, profiles.name, profiles.autor, profiles.beschreibung, profiles.tags,
              profiles.projekt_id,
              nachricht, xjustiz_version, n_status, n_ausp, n_erw,
              n_entschieden, n_punkte,
              gespeichert, aktualisiert, profiles.doc_hash, profiles.fach_hash,
              (SELECT COUNT(*) FROM profile_versions v WHERE v.profile_id = profiles.id) AS n_ver,
              (SELECT MAX(nr) FROM profile_versions v WHERE v.profile_id = profiles.id) AS letzte_nr,
              EXISTS(SELECT 1 FROM profile_versions v
                     WHERE v.profile_id = profiles.id AND v.doc_hash = profiles.doc_hash) AS bekannt,
              ab.nr AS abn_nr, ab.erstellt AS abn_zeit, ab.kommentar AS abn_kommentar,
              ab.fach_hash AS abn_fach_hash,
              (SELECT COUNT(*) FROM hinweise h
               WHERE h.profil_id = profiles.id AND h.erledigt IS NULL) AS hw_offen,
              (SELECT COUNT(*) FROM hinweise h
               WHERE h.profil_id = profiles.id AND h.erledigt IS NULL AND h.rolle = 'extern')
                AS hw_extern
       FROM profiles LEFT JOIN profile_versions ab ON ab.id = profiles.abnahme_version_id
       ORDER BY aktualisiert DESC`,
    ),
    getDoc: db.prepare('SELECT doc FROM profiles WHERE id = ?'),
    schemaList: db.prepare('SELECT * FROM schemas ORDER BY id DESC'),
    schemaNamen: db.prepare('SELECT schema_id, name FROM schema_files ORDER BY name'),
    schemaGet: db.prepare('SELECT * FROM schemas WHERE id = ?'),
    schemaDateien: db.prepare(
      'SELECT name, text FROM schema_files WHERE schema_id = ? ORDER BY name',
    ),
    schemaUpsert: db.prepare(
      `INSERT INTO schemas (id, label, hinweis, zip_url, geholt)
       VALUES (@id, @label, @hinweis, @zipUrl, @geholt)
       ON CONFLICT(id) DO UPDATE SET
         label = @label, hinweis = @hinweis, zip_url = @zipUrl, geholt = @geholt`,
    ),
    schemaDateiEinfuegen: db.prepare(
      'INSERT INTO schema_files (schema_id, name, text) VALUES (?, ?, ?)',
    ),
    schemaDateienLoeschen: db.prepare('DELETE FROM schema_files WHERE schema_id = ?'),
    schemaDel: db.prepare('DELETE FROM schemas WHERE id = ?'),
    getProjekt: db.prepare('SELECT projekt_id FROM profiles WHERE id = ?'),
    setProjekt: db.prepare('UPDATE profiles SET projekt_id = @projektId WHERE id = @id'),
    tmErbeFestschreiben: db.prepare(
      `UPDATE testmessages SET projekt_id = (SELECT projekt_id FROM profiles WHERE id = ?)
       WHERE profil_id = ? AND projekt_id IS NULL`,
    ),
    getRow: db.prepare(
      'SELECT doc, doc_hash, fach_hash, aktualisiert, projekt_id FROM profiles WHERE id = ?',
    ),
    exists: db.prepare('SELECT 1 FROM profiles WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM profiles'),
    del: db.prepare('DELETE FROM profiles WHERE id = ?'),
    upsert: db.prepare(
      `INSERT INTO profiles
         (id, doc, doc_hash, fach_hash, name, autor, beschreibung, tags, nachricht, xjustiz_version, n_status, n_ausp, n_erw, n_entschieden, n_punkte, gespeichert, aktualisiert)
       VALUES
         (@id, @doc, @docHash, @fachHash, @name, @autor, @beschreibung, @tags, @nachricht, @xjustizVersion, @nStatus, @nAusp, @nErw, @nEntschieden, @nPunkte, @gespeichert, @aktualisiert)
       ON CONFLICT(id) DO UPDATE SET
         doc = excluded.doc, doc_hash = excluded.doc_hash, fach_hash = excluded.fach_hash,
         name = excluded.name, autor = excluded.autor, beschreibung = excluded.beschreibung,
         tags = excluded.tags, nachricht = excluded.nachricht,
         xjustiz_version = excluded.xjustiz_version, n_status = excluded.n_status,
         n_ausp = excluded.n_ausp, n_erw = excluded.n_erw,
         n_entschieden = excluded.n_entschieden, n_punkte = excluded.n_punkte,
         gespeichert = excluded.gespeichert, aktualisiert = excluded.aktualisiert`,
    ),

    // ── Profil-Versionen (Snapshots) ────────────────────────────────────
    verList: db.prepare(
      `SELECT id, nr, kommentar, automatisch, abnahme, erstellt
       FROM profile_versions WHERE profile_id = ? ORDER BY nr DESC`,
    ),
    // "bekannt": der uebergebene Stand ist bereits in irgendeiner Version
    // eingefroren (nicht nur der juengsten) — nach einem Restore ist die
    // juengste Version die Sicherheits-Version, der Arbeitsstand aber die
    // wiederhergestellte aeltere; er gilt trotzdem als gesichert.
    verInfo: db.prepare(
      `SELECT COUNT(*) AS n, MAX(nr) AS maxNr,
              EXISTS(SELECT 1 FROM profile_versions WHERE profile_id = @pid AND doc_hash = @hash) AS bekannt
       FROM profile_versions WHERE profile_id = @pid`,
    ),
    verGet: db.prepare('SELECT * FROM profile_versions WHERE id = ? AND profile_id = ?'),
    verInsert: db.prepare(
      `INSERT INTO profile_versions (id, profile_id, nr, kommentar, automatisch, abnahme, doc, doc_hash, fach_hash, erstellt)
       VALUES (@id, @profileId, @nr, @kommentar, @automatisch, @abnahme, @doc, @docHash, @fachHash, @erstellt)`,
    ),
    // Deckel: nur die juengsten AUTO_DECKEL Automatik-Versionen behalten.
    verPrune: db.prepare(
      `DELETE FROM profile_versions
       WHERE profile_id = @pid AND automatisch = 1 AND id NOT IN (
         SELECT id FROM profile_versions WHERE profile_id = @pid AND automatisch = 1
         ORDER BY nr DESC LIMIT ${AUTO_DECKEL})`,
    ),
    verDel: db.prepare('DELETE FROM profile_versions WHERE id = ? AND profile_id = ?'),
    verDelAll: db.prepare('DELETE FROM profile_versions WHERE profile_id = ?'),

    // ── Abnahme (BLK-AG) ────────────────────────────────────────────────
    abnGet: db.prepare(
      `SELECT v.nr, v.kommentar, v.erstellt, v.fach_hash
       FROM profiles p JOIN profile_versions v ON v.id = p.abnahme_version_id
       WHERE p.id = ?`,
    ),
    abnSet: db.prepare('UPDATE profiles SET abnahme_version_id = ? WHERE id = ?'),
    abnRef: db.prepare('SELECT abnahme_version_id FROM profiles WHERE id = ?'),

    // ── Hinweise (eigene Ressource neben dem Profil-Dokument) ───────────
    // Sortierung: offene vor erledigten, darin nach Pfad und Zeit — die
    // Uebersicht im Client zeigt genau diese Reihenfolge.
    hwList: db.prepare(
      `SELECT * FROM hinweise WHERE profil_id = ?
       ORDER BY COALESCE(erledigt, 0), pfad, zeit, id`,
    ),
    hwGet: db.prepare('SELECT * FROM hinweise WHERE id = ? AND profil_id = ?'),
    hwInsert: db.prepare(
      `INSERT INTO hinweise (id, profil_id, pfad, text, autor, rolle, zeit, erledigt, token)
       VALUES (@id, @profilId, @pfad, @text, @autor, @rolle, @zeit, @erledigt, @token)`,
    ),
    hwUpdate: db.prepare(
      'UPDATE hinweise SET text = @text, erledigt = @erledigt WHERE id = @id AND profil_id = @profilId',
    ),
    hwDel: db.prepare('DELETE FROM hinweise WHERE id = ? AND profil_id = ?'),
    hwDelAll: db.prepare('DELETE FROM hinweise WHERE profil_id = ?'),
    hwCount: db.prepare('SELECT COUNT(*) AS n FROM hinweise WHERE profil_id = ?'),
    // Offene Hinweise je Profil, davon von Externen (Issue #43). Gezaehlt wird
    // die Rolle, die der **Server** gestempelt hat; migrierte Altbestaende ohne
    // Rolle zaehlen nur in die Gesamtzahl.
    hwOffen: db.prepare(
      `SELECT COUNT(*) AS offen,
              SUM(CASE WHEN rolle = 'extern' THEN 1 ELSE 0 END) AS extern
       FROM hinweise WHERE profil_id = ? AND erledigt IS NULL`,
    ),

    // ── Testnachrichten (zentraler Testdaten-Speicher) ──────────────────
    tmList: db.prepare(`SELECT ${TM_COLS} ${TM_FROM} ORDER BY t.aktualisiert DESC`),
    tmListProfil: db.prepare(
      `SELECT ${TM_COLS} ${TM_FROM} WHERE t.profil_id = ? ORDER BY t.aktualisiert DESC`,
    ),
    tmGetXml: db.prepare('SELECT xml FROM testmessages WHERE id = ?'),
    tmGetEntscheidungen: db.prepare('SELECT entscheidungen FROM testmessages WHERE id = ?'),
    tmGetBezeichnungen: db.prepare('SELECT bezeichnungen FROM testmessages WHERE id = ?'),
    tmGetVorgabe: db.prepare('SELECT vorgabe FROM testmessages WHERE id = ?'),
    tmGet: db.prepare(`SELECT ${TM_COLS} ${TM_FROM} WHERE t.id = ?`),
    tmGetRow: db.prepare('SELECT * FROM testmessages WHERE id = ?'),
    tmInsert: db.prepare(
      `INSERT INTO testmessages
         (id, xml, name, nachricht, fachmodul, xjustiz_version, groesse, notiz, tags, hochgeladen, aktualisiert,
          entwurf, fortschritt, entscheidungen, bezeichnungen,
          profil_id, profil_name, fassung, vorgabe, vorgabe_hash)
       VALUES
         (@id, @xml, @name, @nachricht, @fachmodul, @xjustizVersion, @groesse, @notiz, @tags, @ts, @ts,
          @entwurf, @fortschritt, @entscheidungen, @bezeichnungen,
          @profilId, @profilName, @fassung, @vorgabe, @vorgabeHash)`,
    ),
    tmUpdate: db.prepare(
      `UPDATE testmessages SET
         xml = @xml, notiz = @notiz, name = @name, tags = @tags, groesse = @groesse,
         entwurf = @entwurf, fortschritt = @fortschritt, entscheidungen = @entscheidungen,
         bezeichnungen = @bezeichnungen, aktualisiert = @aktualisiert
       WHERE id = @id`,
    ),
    tmDel: db.prepare('DELETE FROM testmessages WHERE id = ?'),
    // ── Projekte (#134) ──────────────────────────────────────────────────
    // Die Zahlen kommen als korrelierte Unterabfragen mit: `n_profile` zaehlt
    // die zugeordneten Profilierungen, `n_tm` die Testnachrichten mit eigener
    // ODER geerbter Zuordnung. Die COALESCE-Regel muss dieselbe sein wie in
    // TM_COLS, sonst zaehlt die Kachel anders, als die Projektseite auflistet.
    prjList: db.prepare(
      `SELECT pr.*,
              (SELECT COUNT(*) FROM profiles f WHERE f.projekt_id = pr.id) AS n_profile,
              (SELECT COUNT(*) FROM testmessages t
                 LEFT JOIN profiles f2 ON f2.id = t.profil_id
               WHERE COALESCE(t.projekt_id, f2.projekt_id) = pr.id) AS n_tm
       FROM projekte pr ORDER BY pr.aktualisiert DESC`,
    ),
    prjGet: db.prepare(
      `SELECT pr.*,
              (SELECT COUNT(*) FROM profiles f WHERE f.projekt_id = pr.id) AS n_profile,
              (SELECT COUNT(*) FROM testmessages t
                 LEFT JOIN profiles f2 ON f2.id = t.profil_id
               WHERE COALESCE(t.projekt_id, f2.projekt_id) = pr.id) AS n_tm
       FROM projekte pr WHERE pr.id = ?`,
    ),
    prjGetRow: db.prepare('SELECT * FROM projekte WHERE id = ?'),
    prjInsert: db.prepare(
      `INSERT INTO projekte (id, name, beschreibung, tags, angelegt, aktualisiert)
       VALUES (@id, @name, @beschreibung, @tags, @ts, @ts)`,
    ),
    prjUpdate: db.prepare(
      `UPDATE projekte SET name = @name, beschreibung = @beschreibung, tags = @tags,
              aktualisiert = @aktualisiert
       WHERE id = @id`,
    ),
    prjDel: db.prepare('DELETE FROM projekte WHERE id = ?'),
    prjLoesenProfile: db.prepare('UPDATE profiles SET projekt_id = NULL WHERE projekt_id = ?'),
    prjLoesenTm: db.prepare('UPDATE testmessages SET projekt_id = NULL WHERE projekt_id = ?'),
    tmSetProjekt: db.prepare('UPDATE testmessages SET projekt_id = @projektId WHERE id = @id'),
    tmSetProfil: db.prepare(
      'UPDATE testmessages SET profil_id = @profilId, profil_name = @profilName WHERE id = @id',
    ),
    // Erbt die Nachricht gerade ein Projekt? Nur mit noch existierender
    // Profilierung — nach deren Loeschen erbt nichts mehr und die eigene
    // Zuordnung wird wieder der Weg.
    tmBindung: db.prepare(
      `SELECT t.projekt_id AS eigen, p.id AS profil, p.projekt_id AS geerbt
       FROM testmessages t LEFT JOIN profiles p ON p.id = t.profil_id
       WHERE t.id = ?`,
    ),
    tmAbn: db.prepare('SELECT abnahme_xml FROM testmessages WHERE id = ?'),
    tmAbnSet: db.prepare(
      `UPDATE testmessages SET abnahme_xml = xml, abnahme_ts = @ts, abnahme_kommentar = @kommentar
       WHERE id = @id`,
    ),
    tmVorgabeClear: db.prepare(
      'UPDATE testmessages SET vorgabe = NULL, vorgabe_hash = NULL WHERE id = ?',
    ),
    tmAbnClear: db.prepare(
      `UPDATE testmessages SET abnahme_xml = NULL, abnahme_ts = NULL, abnahme_kommentar = NULL
       WHERE id = ?`,
    ),
  };

  /** Schlagwortspalte (JSON-Array) als Liste; fehlerhafte Altbestaende fallen weg. */
  function leseTags(roh) {
    if (!roh) return undefined;
    try {
      const tags = normalisiereTags(JSON.parse(roh));
      return tags.length ? tags : undefined;
    } catch {
      return undefined;
    }
  }

  /** Schlagworte normalisiert in die Spalte; leere Liste = NULL. */
  function schreibeTags(tags) {
    const norm = normalisiereTags(tags);
    return norm.length ? JSON.stringify(norm) : null;
  }

  /** Eine projekte-Zeile als API-Objekt; leere Felder fallen weg. */
  function prjZeile(r) {
    return {
      id: r.id,
      name: r.name,
      beschreibung: r.beschreibung ?? undefined,
      tags: leseTags(r.tags),
      angelegt: r.angelegt,
      aktualisiert: r.aktualisiert,
      nProfile: r.n_profile ?? 0,
      nTestnachrichten: r.n_tm ?? 0,
    };
  }

  /** Baut die schlanke Index-Zeile (ohne xml/entscheidungen) aus einer DB-Zeile. */
  function tmEntry(r) {
    let fortschritt;
    if (r.fortschritt) {
      try {
        fortschritt = JSON.parse(r.fortschritt);
      } catch {
        fortschritt = undefined;
      }
    }
    return {
      id: r.id,
      name: r.name,
      nachricht: r.nachricht ?? undefined,
      fachmodul: r.fachmodul ?? undefined,
      xjustizVersion: r.xjustiz_version ?? undefined,
      groesse: r.groesse,
      notiz: r.notiz ?? undefined,
      tags: leseTags(r.tags),
      hochgeladen: r.hochgeladen,
      aktualisiert: r.aktualisiert,
      entwurf: !!r.entwurf || undefined,
      fortschritt,
      gefuehrt: !!r.gefuehrt || undefined,
      abgenommen: !!r.abgenommen || undefined,
      abnahmeZeit: r.abgenommen ? (r.abnahme_ts ?? undefined) : undefined,
      abnahmeKommentar: r.abgenommen ? (r.abnahme_kommentar ?? undefined) : undefined,
      geaendertSeitAbnahme: !!r.geaendert_seit_abnahme || undefined,
      // Herkunft der Profil-Bindung — im schlanken Index mit, damit Kachel und
      // Sprung ins Profil ohne Zusatz-Request rendern.
      profilId: r.profil_id ?? undefined,
      profilName: r.profil_name ?? undefined,
      fassung: r.fassung ?? undefined,
      // Badge "Profil weiterentwickelt" — die Nachricht wird NICHT nachgezogen,
      // das Kennzeichen sagt nur, dass die Bindung veraltet ist.
      profilWeiterentwickelt: !!r.profil_weiterentwickelt || undefined,
      // Effektives Projekt: eigene Zuordnung, sonst die der gebundenen
      // Profilierung (COALESCE in TM_COLS). Die Kachel unterscheidet nicht,
      // woher sie kommt — im Projekt liegt die Nachricht so oder so.
      projektId: r.projekt_id ?? undefined,
    };
  }

  /** Eine hinweise-Zeile als API-Objekt (leere Felder fallen weg). */
  function hinweisZeile(r) {
    return {
      id: r.id,
      pfad: r.pfad,
      text: r.text,
      autor: r.autor ?? undefined,
      rolle: r.rolle ?? undefined,
      zeit: r.zeit,
      erledigt: r.erledigt ? true : undefined,
    };
  }

  /**
   * Eine profile_versions-Zeile als Versions-Metadaten plus geparstem Dokument
   * (Vergleichs-Endpunkte). Die Metadaten spiegeln versionsList.
   */
  function verMitDoc(r) {
    return {
      id: r.id,
      nr: r.nr,
      kommentar: r.kommentar ?? undefined,
      automatisch: !!r.automatisch || undefined,
      abnahme: !!r.abnahme || undefined,
      erstellt: r.erstellt,
      doc: JSON.parse(r.doc),
    };
  }

  /**
   * Versions-Felder des LibraryEntry (nVersionen/letzteVersionNr/geaendert).
   * Einziger Anreicherungs-Pfad — alle Entry-liefernden Methoden muessen hier
   * durch, sonst "flackert" das Kennzeichen je nach Operation.
   */
  /**
   * Hinweis-Zaehler des LibraryEntry (Issue #43): offene gesamt und davon von
   * Externen. Ohne offene Hinweise bleiben beide Felder weg — die Karte zeigt
   * das Badge dann gar nicht.
   */
  function hinweisInfo(profileId) {
    const r = stmt.hwOffen.get(profileId);
    if (!r || !r.offen) return {};
    return { nHinweiseOffen: r.offen, nHinweiseExtern: r.extern || undefined };
  }

  function versionsInfo(profileId, aktuellerHash, aktuellerFachHash) {
    const r = stmt.verInfo.get({ pid: profileId, hash: aktuellerHash });
    if (!r || !r.n) return {};
    return {
      nVersionen: r.n,
      letzteVersionNr: r.maxNr,
      geaendert: r.bekannt ? undefined : true,
      ...abnahmeInfo(profileId, aktuellerFachHash),
    };
  }

  /**
   * Abnahme-Felder des LibraryEntry — abgeleitet aus der referenzierten
   * Abnahme-Version; "geaendert seit Abnahme" per Hash-Vergleich zwischen
   * Arbeitsstand und eingefrorenem Stand.
   *
   * Verglichen wird der **Fach**-Hash, nicht der doc_hash: das blosse Oeffnen
   * einer Profilierung schreibt abgeleitete Felder nach (`fortschritt`, #93)
   * und aendert damit die Serialisierung, ohne dass jemand etwas entschieden
   * haette. Ein Kennzeichen "geaendert seit Freigabe" ohne Aenderung entwertet
   * die Freigabe — hier ist falsch-positiv nicht harmlos.
   */
  function abnahmeInfo(profileId, aktuellerFachHash) {
    const a = stmt.abnGet.get(profileId);
    if (!a) return {};
    return {
      abgenommen: true,
      abnahmeVersionNr: a.nr,
      abnahmeZeit: a.erstellt,
      abnahmeKommentar: a.kommentar ?? undefined,
      geaendertSeitAbnahme: a.fach_hash === aktuellerFachHash ? undefined : true,
    };
  }

  /** Schreibt Dokument + abgeleitete Index-Spalten; gibt den LibraryEntry zurueck. */
  function upsert(id, doc, aktualisiert) {
    // Abnahme ist eine Aussage dieser Server-Instanz — etwaige Abnahme-Felder
    // aus eingelieferten Dokumenten (Import/PUT/POST) werden verworfen, damit
    // sich niemand Abnahmen ueber Dateien einschleppt.
    if (doc && typeof doc === 'object') {
      delete doc.abnahme;
      delete doc.abgenommen;
      if (doc.meta && typeof doc.meta === 'object') {
        delete doc.meta.abnahme;
        delete doc.meta.abgenommen;
      }
      // Hinweise sind eine eigene Ressource — im Dokument mitgeschickte
      // Altfelder werden verworfen (nicht uebernommen), sonst faende ein alter
      // Client-Stand einen Weg zurueck ins Dokument. Uebertragen werden sie
      // ausschliesslich ueber /profiles/:id/hinweise.
      hinweiseHerausloesen(doc);
    }
    const ts = aktualisiert ?? Date.now();
    const entry = toEntry(id, doc, ts);
    const docStr = JSON.stringify(doc);
    const hash = docHash(docStr);
    const fHash = fachHash(doc);
    stmt.upsert.run({
      id,
      doc: docStr,
      docHash: hash,
      fachHash: fHash,
      name: entry.name,
      autor: entry.autor ?? null,
      beschreibung: entry.beschreibung ?? null,
      tags: entry.tags?.length ? JSON.stringify(entry.tags) : null,
      nachricht: entry.nachricht,
      xjustizVersion: entry.xjustizVersion ?? null,
      nStatus: entry.nStatus,
      nAusp: entry.nAusp,
      nErw: entry.nErw,
      nEntschieden: entry.nEntschieden ?? null,
      nPunkte: entry.nPunkte ?? null,
      gespeichert: entry.gespeichert ?? null,
      aktualisiert: ts,
    });
    // Die Projektzuordnung steht in der Spalte und wird von `upsert` nicht
    // geschrieben (sie ist keine Eigenschaft des Dokuments). Sie muss trotzdem
    // im Entry stehen: sonst verloere der Client sie bei jedem Autosave.
    const projektId = stmt.getProjekt.get(id)?.projekt_id ?? undefined;
    return { ...entry, projektId, ...versionsInfo(id, hash, fHash), ...hinweisInfo(id) };
  }

  const api = {
    _db: db,

    /** Bibliotheks-Index (LibraryEntry[]), absteigend nach aktualisiert. */
    list() {
      return stmt.list.all().map((r) => ({
        id: r.id,
        name: r.name,
        autor: r.autor ?? undefined,
        beschreibung: r.beschreibung ?? undefined,
        tags: leseTags(r.tags),
        projektId: r.projekt_id ?? undefined,
        nachricht: r.nachricht,
        xjustizVersion: r.xjustiz_version ?? undefined,
        nStatus: r.n_status,
        nAusp: r.n_ausp,
        nErw: r.n_erw ?? undefined,
        nEntschieden: r.n_entschieden ?? undefined,
        nPunkte: r.n_punkte ?? undefined,
        gespeichert: r.gespeichert ?? undefined,
        aktualisiert: r.aktualisiert,
        nVersionen: r.n_ver || undefined,
        letzteVersionNr: r.letzte_nr ?? undefined,
        geaendert: r.n_ver > 0 && !r.bekannt ? true : undefined,
        abgenommen: r.abn_nr != null ? true : undefined,
        abnahmeVersionNr: r.abn_nr ?? undefined,
        abnahmeZeit: r.abn_zeit ?? undefined,
        abnahmeKommentar: r.abn_kommentar ?? undefined,
        geaendertSeitAbnahme:
          r.abn_nr != null && r.abn_fach_hash !== r.fach_hash ? true : undefined,
        // Rueckmeldungen sichtbar machen (Issue #43): ohne offene Hinweise
        // bleiben beide Felder weg, die Karte zeigt dann kein Badge.
        nHinweiseOffen: r.hw_offen || undefined,
        nHinweiseExtern: r.hw_extern || undefined,
      }));
    },

    /**
     * Der LibraryEntry eines einzelnen Profils (oder null) — die Hinweis-Routen
     * geben ihn nach jedem Schreibvorgang zurueck, damit die Dashboard-Zaehler
     * ohne Neuladen stimmen (Issue #43).
     */
    entry(id) {
      const row = stmt.getRow.get(id);
      if (!row) return null;
      return {
        ...toEntry(id, JSON.parse(row.doc), row.aktualisiert),
        ...versionsInfo(id, row.doc_hash, row.fach_hash),
        ...hinweisInfo(id),
        // Projektzuordnung steht in der Spalte, nicht im Dokument — toEntry
        // kann sie daher nicht kennen.
        projektId: row.projekt_id ?? undefined,
      };
    },

    /** Das komplette ProfileDoc zu einer id oder null. */
    load(id) {
      const row = stmt.getDoc.get(id);
      return row ? JSON.parse(row.doc) : null;
    },

    count() {
      return stmt.count.get().n;
    },

    upsert,

    /** Neues Profil; id serverseitig vergeben. Gibt { id, entry }. */
    create(doc) {
      const id = randomUUID();
      const entry = upsert(id, doc);
      return { id, entry };
    },

    /**
     * Kopie mit neuer id und Namenszusatz " (Kopie)"; die Hinweise wandern mit
     * (die Kopie schreibt die offene Klaerungslage fort), bekommen aber eigene
     * ids — Original und Kopie sind danach unabhaengig.
     * Gibt { id, entry } oder null.
     */
    duplicate(id) {
      const doc = this.load(id);
      if (!doc) return null;
      return db.transaction(() => {
        const copy = structuredClone(doc);
        copy.meta = {
          ...(copy.meta ?? {}),
          name: (copy.meta?.name || '(ohne Namen)') + ' (Kopie)',
        };
        const out = this.create(copy);
        for (const h of stmt.hwList.all(id))
          stmt.hwInsert.run({
            id: randomUUID(),
            profilId: out.id,
            pfad: h.pfad,
            text: h.text,
            autor: h.autor,
            rolle: h.rolle,
            zeit: h.zeit,
            erledigt: h.erledigt,
            token: null,
          });
        return out;
      })();
    },

    /** Nur den Namen aendern. Gibt den aktualisierten entry oder null. */
    rename(id, name) {
      return this.patchMeta(id, { name });
    },

    /**
     * Kachel-Metadaten aendern, ohne das Profil zu oeffnen: Name, Autor,
     * Beschreibung, Schlagworte. Nur die im Patch **gesetzten** Felder werden
     * uebernommen (undefined = unberuehrt) — der Aufrufer schickt das Dokument
     * nicht mit, es wird hier gelesen und zurueckgeschrieben. Gibt den
     * LibraryEntry oder null.
     */
    patchMeta(id, { name, autor, beschreibung, tags }) {
      const doc = this.load(id);
      if (!doc) return null;
      const meta = { ...(doc.meta ?? {}) };
      if (name !== undefined) meta.name = String(name || '').trim();
      if (autor !== undefined) meta.autor = String(autor || '').trim();
      if (beschreibung !== undefined) meta.beschreibung = String(beschreibung || '').trim();
      if (tags !== undefined) meta.tags = normalisiereTags(tags);
      doc.meta = meta;
      return upsert(id, doc);
    },

    /**
     * Einsortieren (#134): Projekt und Schlagworte einer Profilierung — die
     * **Ablage**, nicht die fachliche Aussage. Bewusst getrennt von `patchMeta`
     * (Name/Autor/Beschreibung), weil dieser Weg auch bei freigegebenen
     * Profilierungen offen steht: der `fach_hash` laesst beide aussen vor, eine
     * Freigabe wird durch Einsortieren also nicht entwertet.
     *
     * Die Projektzuordnung liegt in der Spalte, nicht im Dokument — sie ist
     * eine Kante zwischen zwei Zeilen, und eine eingefrorene Version soll die
     * Zuordnung des Originals nicht konservieren. Deshalb ruehrt das Setzen des
     * Projekts den `doc_hash` nicht an; ein Schlagwort-Wechsel tut es weiterhin
     * (die Schlagworte stehen in `meta.tags`).
     *
     * Nur gesetzte Felder wirken. Gibt den LibraryEntry oder null.
     */
    einsortieren(id, { projektId, tags }) {
      if (!stmt.exists.get(id)) return null;
      if (projektId !== undefined) stmt.setProjekt.run({ id, projektId: projektId || null });
      if (tags !== undefined) return this.patchMeta(id, { tags });
      return this.entry(id);
    },

    /**
     * Loeschen inkl. aller Versionen und Hinweise (Kaskade). Gibt true, wenn
     * eine Zeile entfernt wurde.
     */
    delete(id) {
      return db.transaction(() => {
        // Erbe festschreiben (#134): mit der Profilierung faellt der LEFT JOIN
        // weg, ueber den ihre Testnachrichten das Projekt erben. Ohne diesen
        // Schritt verschwaenden sie lautlos aus dem Projekt — die Nachrichten
        // selbst ueberleben das Loeschen ja (eingefrorene Vorgabe).
        stmt.tmErbeFestschreiben.run(id, id);
        stmt.verDelAll.run(id);
        stmt.hwDelAll.run(id);
        return stmt.del.run(id).changes > 0;
      })();
    },

    // ── Projekte (#134) ─────────────────────────────────────────────────

    /**
     * Projektliste mit abgeleiteten Zahlen: wie viele Profilierungen
     * (Kommunikationsszenarien) haengen daran, und wie viele Testnachrichten
     * insgesamt — eigene Zuordnung **oder** ueber ihre Profilierung geerbt.
     * Die Zahlen stehen auf der Kachel, deshalb kommen sie mit dem Index statt
     * per Zusatz-Request je Projekt.
     */
    prjList() {
      return stmt.prjList.all().map(prjZeile);
    },

    /** Ein Projekt (mit Zahlen) oder null. */
    prjGet(id) {
      const r = stmt.prjGet.get(id);
      return r ? prjZeile(r) : null;
    },

    /** Neues Projekt; id serverseitig. Gibt { id, entry }. */
    prjCreate({ name, beschreibung, tags }, ts) {
      const id = randomUUID();
      const stamp = ts ?? Date.now();
      stmt.prjInsert.run({
        id,
        name: String(name || '').trim() || '(ohne Namen)',
        beschreibung: String(beschreibung || '').trim() || null,
        tags: schreibeTags(tags),
        ts: stamp,
      });
      return { id, entry: this.prjGet(id) };
    },

    /**
     * Felder aendern; nur gesetzte wirken (undefined = unberuehrt).
     * Gibt den Eintrag oder null.
     */
    prjUpdate(id, { name, beschreibung, tags }, ts) {
      const row = stmt.prjGetRow.get(id);
      if (!row) return null;
      stmt.prjUpdate.run({
        id,
        name: name !== undefined ? String(name || '').trim() || '(ohne Namen)' : row.name,
        beschreibung:
          beschreibung !== undefined ? String(beschreibung || '').trim() || null : row.beschreibung,
        tags: tags !== undefined ? schreibeTags(tags) : row.tags,
        aktualisiert: ts ?? Date.now(),
      });
      return this.prjGet(id);
    },

    /**
     * Projekt loeschen. Entfernt **nur die Zuordnungen**, nie Inhalte: die
     * Profilierungen und Testnachrichten bleiben, sie liegen danach in keinem
     * Projekt mehr. Gibt true, wenn eine Zeile entfernt wurde.
     */
    prjDelete(id) {
      return db.transaction(() => {
        stmt.prjLoesenProfile.run(id);
        stmt.prjLoesenTm.run(id);
        return stmt.prjDel.run(id).changes > 0;
      })();
    },

    // ── Schemaquellen (von xjustiz.de) ──────────────────────────────────

    /**
     * Die gespeicherten Versionen samt ihrer Dateinamen — der Umschalter zeigt
     * sie neben den hinterlegten. Die Dateiinhalte bleiben aussen vor (je
     * Version einige MB); die holt `schemaDateien(id)` einzeln.
     */
    schemaList() {
      const namen = new Map();
      for (const r of stmt.schemaNamen.all()) {
        const liste = namen.get(r.schema_id);
        if (liste) liste.push(r.name);
        else namen.set(r.schema_id, [r.name]);
      }
      return stmt.schemaList.all().map((r) => schemaZeile(r, namen.get(r.id) ?? []));
    },

    /** XSD-Dateien einer gespeicherten Version; leer, wenn sie nicht vorliegt. */
    schemaDateien(id) {
      return stmt.schemaDateien.all(id);
    },

    /** Ist die Version gespeichert? */
    schemaVorhanden(id) {
      return !!stmt.schemaGet.get(id);
    },

    /**
     * Version ablegen oder **ersetzen** (Aktualisieren): die Dateien werden
     * komplett ausgetauscht, damit eine geschrumpfte Nachlieferung keine
     * Karteileichen der vorigen Fassung stehen laesst. Gibt den Eintrag zurueck.
     */
    schemaSpeichern({ id, label, hinweis, zipUrl, files }, ts) {
      const geholt = ts ?? Date.now();
      db.transaction(() => {
        stmt.schemaUpsert.run({
          id,
          label: String(label || id),
          hinweis: hinweis ? String(hinweis) : null,
          zipUrl: zipUrl ? String(zipUrl) : null,
          geholt,
        });
        // Ohne `files` wird nur die **Bezugsquelle** gemerkt: die Version steht
        // dann im Umschalter, ihr ZIP wird beim ersten Waehlen geholt. Bereits
        // vorhandene Dateien bleiben dabei liegen -- das Abrufen der
        // Versionsliste darf einen geholten Stand nicht leeren.
        if (files) {
          stmt.schemaDateienLoeschen.run(id);
          for (const f of files) stmt.schemaDateiEinfuegen.run(id, f.name, f.text);
        }
      })();
      const namen = files
        ? files.map((f) => f.name).sort()
        : stmt.schemaDateien.all(id).map((d) => d.name);
      return schemaZeile(stmt.schemaGet.get(id), namen);
    },

    /** Version samt Dateien entfernen. Gibt true, wenn eine Zeile wegfiel. */
    schemaLoeschen(id) {
      return db.transaction(() => {
        stmt.schemaDateienLoeschen.run(id);
        return stmt.schemaDel.run(id).changes > 0;
      })();
    },

    // ── Hinweise (eigene Ressource) ─────────────────────────────────────

    /** Alle Hinweise eines Profils; offene vor erledigten. null, wenn Profil fehlt. */
    hinweiseList(profilId) {
      if (!stmt.exists.get(profilId)) return null;
      return stmt.hwList.all(profilId).map(hinweisZeile);
    },

    /**
     * Hinweis anlegen (Issue #40). Der Name ist **Selbstauskunft** und kommt vom
     * Client; `zeit` und `rolle` setzt der Server selbst — die Rolle leitet sich
     * aus dem mitgeschickten AG-Schluessel ab und ist deshalb belastbar, auch
     * wenn der Klarname es nicht ist. Vom Client mitgeschickte Werte fuer beides
     * werden ignoriert (die Signatur nimmt sie gar nicht erst entgegen).
     * null, wenn das Profil fehlt.
     */
    hinweisAnlegen(profilId, { pfad, text, autor }, ts, rolle) {
      if (!stmt.exists.get(profilId)) return null;
      const id = randomUUID();
      const name = String(autor ?? '').trim();
      // Urheber-Merkmal (Issue #42): ein Geheimnis, das nur der Anleger
      // zurueckbekommt. Damit darf er seinen eigenen Eintrag noch aendern oder
      // loeschen, auch ohne AG-Schluessel an einer abgenommenen Profilierung.
      const token = randomUUID();
      stmt.hwInsert.run({
        id,
        profilId,
        pfad: String(pfad ?? ''),
        text: String(text ?? '').trim(),
        autor: name || null,
        rolle: rolle === 'ag' || rolle === 'extern' ? rolle : null,
        zeit: ts ?? Date.now(),
        erledigt: null,
        token,
      });
      // Das Token steht **nur** in dieser Antwort, nie in der Liste.
      return { ...hinweisZeile(stmt.hwGet.get(id, profilId)), token };
    },

    /**
     * Ist das mitgeschickte Geheimnis das des Hinweises? Grundlage der Ausnahme
     * "der Urheber darf seinen eigenen Eintrag noch korrigieren" (Issue #42).
     * Die id allein taugt als Nachweis nicht — die Liste ist fuer alle lesbar.
     */
    hinweisIstUrheber(profilId, id, token) {
      const row = stmt.hwGet.get(id, profilId);
      return !!row && !!row.token && !!token && row.token === token;
    },

    /** Text und/oder Erledigt-Zustand aendern (undefined = unberuehrt). null, wenn unbekannt. */
    hinweisAendern(profilId, id, { text, erledigt }) {
      const row = stmt.hwGet.get(id, profilId);
      if (!row) return null;
      const naechsterText = text !== undefined ? String(text).trim() : row.text;
      if (!naechsterText) return 'leer';
      stmt.hwUpdate.run({
        id,
        profilId,
        text: naechsterText,
        erledigt: erledigt !== undefined ? (erledigt ? 1 : null) : row.erledigt,
      });
      return hinweisZeile(stmt.hwGet.get(id, profilId));
    },

    /** Einen Hinweis loeschen. Gibt true, wenn eine Zeile entfernt wurde. */
    hinweisLoeschen(profilId, id) {
      return stmt.hwDel.run(id, profilId).changes > 0;
    },

    /**
     * Alle Hinweise auf und unter einem Pfad loeschen — Gegenstueck zur Kaskade
     * im Client, wenn eine Auspraegung oder Schema-Erweiterung entfernt wird:
     * das Element ist weg, sein Hinweis darf nicht in der Ablage zurueckbleiben.
     *
     * Gefiltert wird in JS und nicht per LIKE: Pfadsegmente sind NCNames und
     * duerfen '_' enthalten, das LIKE als Platzhalter liest. Die Grenzen '/' und
     * '@' entsprechen `unterPfad` im Client (core/util/pfad.util.ts) — ohne sie traefe `…/anlage` auch
     * `…/anlageArt`. Gibt die Anzahl entfernter Zeilen zurueck.
     */
    hinweiseLoeschenUnter(profilId, praefix) {
      const p = String(praefix ?? '');
      if (!p) return 0;
      const treffer = stmt.hwList
        .all(profilId)
        .filter((r) => r.pfad === p || r.pfad.startsWith(p + '/') || r.pfad.startsWith(p + '@'));
      if (!treffer.length) return 0;
      return db.transaction(() => {
        for (const r of treffer) stmt.hwDel.run(r.id, profilId);
        return treffer.length;
      })();
    },

    /**
     * Alle Hinweise eines Profils ersetzen (JSON-Import einer Datei). Bewusst
     * ein Volltausch statt Zusammenfuehren — Konfliktlogik gehoert nicht in den
     * Dateiaustausch. Anders als beim Anlegen bleiben `zeit`, `autor` und
     * `rolle` der Datei erhalten: der Import dokumentiert, wer wann was gesagt
     * hat. null, wenn das Profil fehlt.
     */
    hinweiseErsetzen(profilId, liste, ts) {
      if (!stmt.exists.get(profilId)) return null;
      return db.transaction(() => {
        stmt.hwDelAll.run(profilId);
        for (const h of Array.isArray(liste) ? liste : []) {
          const text = String(h?.text ?? '').trim();
          if (!text) continue;
          stmt.hwInsert.run({
            id: randomUUID(),
            profilId,
            pfad: String(h.pfad ?? ''),
            text,
            autor: h.autor ? String(h.autor) : null,
            rolle: h.rolle === 'ag' || h.rolle === 'extern' ? h.rolle : null,
            zeit: Number.isFinite(h.zeit) ? h.zeit : (ts ?? Date.now()),
            erledigt: h.erledigt ? 1 : null,
            token: null,
          });
        }
        return stmt.hwList.all(profilId).map(hinweisZeile);
      })();
    },

    // ── Profil-Versionen (Snapshots) ────────────────────────────────────

    /** Versionsliste (ohne doc), absteigend nach nr; null wenn Profil fehlt. */
    versionsList(profileId) {
      if (!stmt.exists.get(profileId)) return null;
      return stmt.verList.all(profileId).map((r) => ({
        id: r.id,
        nr: r.nr,
        kommentar: r.kommentar ?? undefined,
        automatisch: !!r.automatisch || undefined,
        abnahme: !!r.abnahme || undefined,
        erstellt: r.erstellt,
      }));
    },

    /**
     * Eine Version inklusive eingefrorenem Dokument (fuer den Vergleich
     * "was hat sich seit vX geaendert?"). null wenn Profil oder Version fehlt;
     * verGet filtert bereits nach profile_id — eine fremde vid faellt durch.
     */
    versionGet(profileId, versionId) {
      const r = stmt.verGet.get(versionId, profileId);
      return r ? verMitDoc(r) : null;
    },

    /**
     * Die aktuell referenzierte Abnahme-Version inklusive Dokument; null wenn
     * das Profil nicht abgenommen ist. Bewusst ueber profiles.abnahme_version_id
     * und nicht ueber "juengste Version mit abnahme = 1" — nach einer Neuabnahme
     * gibt es mehrere solche Zeilen, massgeblich ist allein die Referenz.
     */
    abnahmeVersion(profileId) {
      const vid = stmt.abnRef.get(profileId)?.abnahme_version_id;
      if (!vid) return null;
      const r = stmt.verGet.get(vid, profileId);
      return r ? verMitDoc(r) : null;
    },

    /**
     * Version (Snapshot) anlegen — kopiert den aktuell gespeicherten doc-String
     * verbatim aus der profiles-Zeile. Automatik-Versionen sind entprellt
     * (kein Duplikat, wenn die juengste Version denselben Stand traegt) und
     * auf AUTO_DECKEL gedeckelt; manuelle entstehen immer.
     * Gibt null (Profil fehlt), { skipped, entry } oder { version, entry }.
     */
    versionCreate(profileId, { kommentar, automatisch, abnahme } = {}, ts) {
      return db.transaction(() => {
        const row = stmt.getRow.get(profileId);
        if (!row) return null;
        const entry = () => ({
          ...toEntry(profileId, JSON.parse(row.doc), row.aktualisiert),
          ...versionsInfo(profileId, row.doc_hash, row.fach_hash),
          ...hinweisInfo(profileId),
        });
        const info = stmt.verInfo.get({ pid: profileId, hash: row.doc_hash });
        if (automatisch && info.bekannt) {
          return { skipped: true, entry: entry() };
        }
        const id = randomUUID();
        const nr = (info.maxNr ?? 0) + 1;
        const erstellt = ts ?? Date.now();
        stmt.verInsert.run({
          id,
          profileId,
          nr,
          kommentar: kommentar || null,
          automatisch: automatisch ? 1 : null,
          abnahme: abnahme ? 1 : null,
          doc: row.doc,
          docHash: row.doc_hash,
          fachHash: row.fach_hash,
          erstellt,
        });
        if (automatisch) stmt.verPrune.run({ pid: profileId });
        return {
          version: {
            id,
            nr,
            kommentar: kommentar || undefined,
            automatisch: automatisch ? true : undefined,
            abnahme: abnahme ? true : undefined,
            erstellt,
          },
          entry: entry(),
        };
      })();
    },

    // ── Abnahme (BLK-AG) ────────────────────────────────────────────────

    /** Traegt das Profil das Abnahme-Kennzeichen? (fehlendes Profil: false) */
    abgenommen(id) {
      return !!stmt.abnRef.get(id)?.abnahme_version_id;
    },

    /**
     * Abnehmen: friert den aktuellen Stand als Abnahme-Version ein (Kennzeichen
     * `abnahme`, optionaler Kommentar) und setzt die Referenz am Profil.
     * Neuabnahme erzeugt den naechsten Snapshot und verschiebt die Referenz.
     * Gibt { version, entry } oder null (Profil fehlt).
     */
    abnahmeSetzen(profileId, { kommentar } = {}, ts) {
      return db.transaction(() => {
        const out = this.versionCreate(profileId, { kommentar, abnahme: true }, ts);
        if (!out) return null;
        stmt.abnSet.run(out.version.id, profileId);
        const row = stmt.getRow.get(profileId);
        return {
          version: out.version,
          entry: {
            ...toEntry(profileId, JSON.parse(row.doc), row.aktualisiert),
            ...versionsInfo(profileId, row.doc_hash, row.fach_hash),
          },
        };
      })();
    },

    /**
     * Kennzeichen entfernen: loescht nur die Referenz, nicht die Version.
     * Gibt den entry oder null (Profil fehlt).
     */
    abnahmeEntfernen(profileId) {
      const row = stmt.getRow.get(profileId);
      if (!row) return null;
      stmt.abnSet.run(null, profileId);
      return {
        ...toEntry(profileId, JSON.parse(row.doc), row.aktualisiert),
        ...versionsInfo(profileId, row.doc_hash, row.fach_hash),
        ...hinweisInfo(profileId),
      };
    },

    /**
     * Version wiederherstellen: zuerst den Arbeitsstand als Sicherheits-Version
     * sichern (automatisch, entprellt — entfaellt bei identischem Stand), dann
     * das Profil-doc durch den Versionsstand ersetzen. Eine Transaktion.
     * Gibt null oder { entry, doc, sicherheitsVersion? }.
     */
    versionRestore(profileId, versionId, ts) {
      return db.transaction(() => {
        const ver = stmt.verGet.get(versionId, profileId);
        if (!ver) return null;
        const sicherung = this.versionCreate(
          profileId,
          { automatisch: true, kommentar: `Stand vor Wiederherstellung von v${ver.nr}` },
          ts,
        );
        if (!sicherung) return null;
        const doc = JSON.parse(ver.doc);
        const entry = upsert(profileId, doc, ts);
        return { entry, doc, sicherheitsVersion: sicherung.version };
      })();
    },

    /**
     * Version loeschen. Die aktuell referenzierte Abnahme-Version ist gesperrt
     * (erst Kennzeichen entfernen) — dann 'abnahme' statt boolean.
     */
    versionDelete(profileId, versionId) {
      if (stmt.abnRef.get(profileId)?.abnahme_version_id === versionId) return 'abnahme';
      return stmt.verDel.run(versionId, profileId).changes > 0;
    },

    /**
     * Bulk-Import (Migration). Erhaelt uebergebene id + aktualisiert-Zeitstempel,
     * damit Reihenfolge/Historie im Dashboard konsistent bleiben. Eine Transaktion.
     */
    importAll(items) {
      const tx = db.transaction((list) => {
        let n = 0;
        for (const it of list) {
          if (!it || !it.id || !it.doc) continue;
          // Hier sind die Altfelder im Dokument der Normalfall, nicht ein
          // Fremdkoerper: eingeliefert werden localStorage-Staende und
          // Notfallkopien von *vor* der Umstellung. `upsert` verwirft sie
          // (Einliefer-Schutz), also vorher herausloesen und als Liste
          // schreiben — sonst verlor der erste Start nach dem Upgrade die
          // Hinweise stillschweigend, entgegen der Zusage "vorhandene Hinweise
          // aus alten Staenden sind unveraendert vorhanden".
          const gefunden = hinweiseHerausloesen(it.doc);
          upsert(it.id, it.doc, it.aktualisiert);
          // Nur, wenn die Ablage zu diesem Profil noch leer ist: sie ist die
          // fuehrende Quelle. Ein eingeliefertes Alt-Dokument darf neuere
          // Hinweise nicht ersetzen, und ein zweiter Lauf derselben Kopie darf
          // sie nicht verdoppeln.
          if (gefunden.length && !stmt.hwCount.get(it.id).n) {
            for (const h of gefunden)
              stmt.hwInsert.run({
                id: randomUUID(),
                profilId: it.id,
                pfad: h.pfad,
                text: h.text,
                autor: null,
                rolle: null,
                zeit: it.aktualisiert ?? Date.now(),
                erledigt: h.erledigt ? 1 : null,
                token: null,
              });
          }
          n++;
        }
        return n;
      });
      return tx(items ?? []);
    },

    // ── Testnachrichten ─────────────────────────────────────────────────

    /**
     * Index-Liste (ohne xml), absteigend nach aktualisiert. `profil` grenzt auf
     * die an eine Profilierung gebundenen Nachrichten ein ("alle Testdaten
     * dieses Szenarios zusammen sehen").
     */
    tmList({ profil } = {}) {
      const rows = profil ? stmt.tmListProfil.all(profil) : stmt.tmList.all();
      return rows.map(tmEntry);
    },

    /** Roh-XML zu einer id oder null. */
    tmLoadXml(id) {
      const row = stmt.tmGetXml.get(id);
      return row ? row.xml : null;
    },

    /** Gespeicherter Entscheidungsstand (JSON) oder null. */
    tmLoadEntscheidungen(id) {
      const row = stmt.tmGetEntscheidungen.get(id);
      if (!row || !row.entscheidungen) return null;
      try {
        return JSON.parse(row.entscheidungen);
      } catch {
        return null;
      }
    },

    /**
     * Bezeichnungen der benannten Vorkommen (JSON) oder null. Sie liegen neben
     * dem XML, weil die Namen dort keine Entsprechung haben — ohne sie hiesse
     * jedes Vorkommen nach dem naechsten Oeffnen wieder "Vorkommen N".
     */
    tmLoadBezeichnungen(id) {
      const row = stmt.tmGetBezeichnungen.get(id);
      if (!row || !row.bezeichnungen) return null;
      try {
        return JSON.parse(row.bezeichnungen);
      } catch {
        return null;
      }
    },

    /**
     * Eingefrorene Kopie der gebundenen Profilfassung (JSON) oder null. Sie ist
     * vom Profil-Bestand unabhaengig und bleibt lesbar, wenn die Profilierung
     * geaendert oder geloescht wurde.
     */
    tmLoadVorgabe(id) {
      const row = stmt.tmGetVorgabe.get(id);
      if (!row || !row.vorgabe) return null;
      try {
        return JSON.parse(row.vorgabe);
      } catch {
        return null;
      }
    },

    /**
     * Profilbindung loesen (Issue #32): die eingefrorene Kopie und ihr Hash
     * fallen weg — damit enden Sperren, Fuehrung und das Kennzeichen "Profil
     * weiterentwickelt". Die **Herkunft** (profil_id/profil_name/fassung) bleibt
     * stehen: sie ist Historie und soll auf der Kachel sichtbar bleiben. Gibt
     * die aktualisierte Index-Zeile zurueck, null bei unbekannter id.
     */
    tmBindungLoesen(id) {
      if (!stmt.tmGetRow.get(id)) return null;
      stmt.tmVorgabeClear.run(id);
      // Die Projektzugehoerigkeit bleibt: sie haengt an `profil_id`, und die
      // steht als Herkunft weiterhin da. Erst das **Loeschen** der Profilierung
      // kappt das Erbe — dort wird es festgeschrieben (siehe `delete`).
      return tmEntry(stmt.tmGet.get(id));
    },

    /** Neue Testnachricht; id serverseitig vergeben. Gibt { id, entry }. */
    tmCreate(
      {
        name,
        xml,
        nachricht,
        fachmodul,
        xjustizVersion,
        groesse,
        entwurf,
        fortschritt,
        entscheidungen,
        bezeichnungen,
        tags,
        profilId,
        profilName,
        fassung,
        vorgabe,
      },
      ts,
    ) {
      const id = randomUUID();
      const stamp = ts ?? Date.now();
      stmt.tmInsert.run({
        id,
        xml: String(xml ?? ''),
        name: name ?? null,
        nachricht: nachricht ?? null,
        fachmodul: fachmodul ?? null,
        xjustizVersion: xjustizVersion ?? null,
        groesse: groesse ?? (xml ? String(xml).length : 0),
        notiz: null,
        tags: schreibeTags(tags),
        entwurf: entwurf ? 1 : null,
        fortschritt: fortschritt ? JSON.stringify(fortschritt) : null,
        entscheidungen: entscheidungen ? JSON.stringify(entscheidungen) : null,
        bezeichnungen: bezeichnungen ? JSON.stringify(bezeichnungen) : null,
        profilId: profilId ?? null,
        profilName: profilName ?? null,
        fassung: fassung ?? null,
        vorgabe: vorgabe ? JSON.stringify(vorgabe) : null,
        vorgabeHash: vorgabe ? fachHash(vorgabe) : null,
        ts: stamp,
      });
      return { id, entry: tmEntry(stmt.tmGet.get(id)) };
    },

    /**
     * Variante einer Testnachricht (#133): Kopie mit neuer id und Namenszusatz
     * " (Variante)". Die Auspraegungen eines Szenarios unterscheiden sich meist
     * in einem einzigen Vorkommen — sie entstehen als Kopie und werden danach
     * angepasst, statt jedes Mal von vorn erzeugt zu werden.
     *
     * Die Profil-Bindung wandert mit, wird dabei aber auf den **aktuellen**
     * Stand der Profilierung gesetzt (Name, Fassung "Arbeitsstand vom …",
     * eingefrorene Vorgabe und deren Hash frisch aus der Profilierung): die
     * Variante entsteht jetzt und soll dem Szenario entsprechen. Das ist der
     * Unterschied zum Original — eine bloss zugeordnete Nachricht (#141) hat
     * gar keine Vorgabe, eine gefuehrt erstellte womoeglich eine laengst
     * ueberholte; ohne Vorgabe fehlten der Kopie Ueberlagerung, Fuehrung und
     * Sperren des Szenarios. Ist die Profilierung geloescht, wandert die alte
     * Bindung unveraendert mit (die Herkunft bleibt Historie, siehe
     * `tmZuordnen`). Der Abnahme-Stand bleibt zurueck — die Kopie ist
     * unmarkiert und frei bearbeitbar, wie die Profil-Kopie in `duplicate`.
     *
     * Der Nachrichtenkopf wird nicht angefasst. Mit gleichem Erstellungs-
     * zeitpunkt und gleicher Nachrichten-UUID besteht der Vergleich zweier
     * Varianten aus fachlichen Unterschieden statt aus Zeitstempel-Rauschen.
     *
     * Gibt { id, entry } oder null bei unbekannter id.
     */
    tmDuplicate(id, ts) {
      const row = stmt.tmGetRow.get(id);
      if (!row) return null;
      const neueId = randomUUID();
      const stamp = ts ?? Date.now();
      // Bindung an den heutigen Stand der Profilierung; nur wenn es sie nicht
      // mehr gibt, bleibt die Bindung des Originals stehen.
      const profil = row.profil_id ? stmt.getRow.get(row.profil_id) : null;
      const bindung = profil
        ? {
            profilId: row.profil_id,
            profilName: JSON.parse(profil.doc)?.meta?.name || row.profil_name,
            fassung: 'Arbeitsstand vom ' + datumDe(profil.aktualisiert),
            vorgabe: profil.doc,
            vorgabeHash: profil.fach_hash ?? fachHash(JSON.parse(profil.doc)),
          }
        : {
            profilId: row.profil_id,
            profilName: row.profil_name,
            fassung: row.fassung,
            vorgabe: row.vorgabe,
            vorgabeHash: row.vorgabe_hash,
          };
      // Direkt aus der Zeile, nicht ueber tmCreate: so wandert die Notiz mit
      // (tmCreate setzt sie fuer Uploads immer auf null).
      stmt.tmInsert.run({
        id: neueId,
        xml: row.xml,
        name: (row.name || '(ohne Namen)') + ' (Variante)',
        nachricht: row.nachricht,
        fachmodul: row.fachmodul,
        xjustizVersion: row.xjustiz_version,
        groesse: row.groesse,
        notiz: row.notiz,
        tags: row.tags,
        entwurf: row.entwurf,
        fortschritt: row.fortschritt,
        entscheidungen: row.entscheidungen,
        bezeichnungen: row.bezeichnungen,
        ...bindung,
        ts: stamp,
      });
      return { id: neueId, entry: tmEntry(stmt.tmGet.get(neueId)) };
    },

    /**
     * Felder ändern; nur die im Patch gesetzten werden übernommen (undefined =
     * unberührt). Aktualisiert-Zeitstempel setzen. Gibt entry oder null.
     * Herkunft und eingefrorene Kopie der Profil-Bindung sind bewusst nicht
     * änderbar — die gebundene Fassung ist unveränderliche Vorgabe.
     */
    tmUpdate(
      id,
      { notiz, name, tags, xml, entwurf, fortschritt, entscheidungen, bezeichnungen },
      ts,
    ) {
      const row = stmt.tmGetRow.get(id);
      if (!row) return null;
      const nextXml = xml !== undefined ? String(xml) : row.xml;
      const next = {
        xml: nextXml,
        groesse: xml !== undefined ? nextXml.length : row.groesse,
        notiz: notiz !== undefined ? notiz || null : row.notiz,
        name: name !== undefined ? name || null : row.name,
        tags: tags !== undefined ? schreibeTags(tags) : row.tags,
        entwurf: entwurf !== undefined ? (entwurf ? 1 : null) : row.entwurf,
        fortschritt:
          fortschritt !== undefined
            ? fortschritt
              ? JSON.stringify(fortschritt)
              : null
            : row.fortschritt,
        entscheidungen:
          entscheidungen !== undefined
            ? entscheidungen
              ? JSON.stringify(entscheidungen)
              : null
            : row.entscheidungen,
        bezeichnungen:
          bezeichnungen !== undefined
            ? bezeichnungen && Object.keys(bezeichnungen).length
              ? JSON.stringify(bezeichnungen)
              : null
            : row.bezeichnungen,
        aktualisiert: ts ?? Date.now(),
      };
      stmt.tmUpdate.run({ id, ...next });
      return tmEntry(stmt.tmGet.get(id));
    },

    /**
     * Eine Testnachricht nachtraeglich einem Kommunikationsszenario zuordnen
     * (#141). Gedacht fuer **hochgeladene** Nachrichten: fachlich gehoeren sie
     * laengst zu einem Szenario, technisch fehlte ihnen die Kante.
     *
     * Gesetzt wird nur die **Herkunft** (`profil_id`/`profil_name`), nicht die
     * eingefrorene Vorgabe. Die Vorgabe ist die unveraenderliche Leitplanke
     * eines gefuehrten Durchlaufs — eine hochgeladene Nachricht ist nicht gegen
     * sie entstanden, und sie im Nachhinein zu behaupten waere eine falsche
     * Aussage: das Kennzeichen "Profil weiterentwickelt" verglichen dann einen
     * Stand, den die Nachricht nie gesehen hat. Wer wissen will, ob sie die
     * Festlegungen einhaelt, hat dafuer "Gegen Profilierung pruefen".
     *
     * `profilId: null` loest die Zuordnung wieder (Herkunft faellt weg).
     * Zusammen mit einer bestehenden Vorgabe wird nichts angefasst — dort ist
     * `tmBindungLoesen` der richtige Weg.
     *
     * Gibt `{ entry }`, `null` bei unbekannter id oder `{ fehler: '…' }`.
     */
    tmZuordnen(id, { profilId }, ts) {
      const row = stmt.tmGetRow.get(id);
      if (!row) return null;
      if (row.vorgabe) return { fehler: 'gebunden' };
      if (profilId) {
        const profil = stmt.getRow.get(profilId);
        if (!profil) return { fehler: 'unbekanntes-profil' };
        const name = JSON.parse(profil.doc)?.meta?.name || null;
        stmt.tmSetProfil.run({ id, profilId, profilName: name });
      } else {
        stmt.tmSetProfil.run({ id, profilId: null, profilName: null });
      }
      // Der Zeitstempel bleibt stehen: Zuordnen ist Einordnung, keine
      // Bearbeitung — die Nachricht soll nicht an die Spitze der Liste springen.
      void ts;
      return { entry: tmEntry(stmt.tmGet.get(id)) };
    },

    /**
     * Einsortieren einer Testnachricht (#134): Schlagworte immer, das Projekt
     * nur, solange die Nachricht **nicht** an eine noch existierende
     * Profilierung gebunden ist. Gebundene Nachrichten erben das Projekt ihrer
     * Profilierung — ein zweiter Pflegeort erzeugte nur Widersprueche
     * ("Nachricht in Projekt A, Profil in Projekt B").
     *
     * Gibt `{ entry }`, `null` bei unbekannter id oder `{ fehler: 'gebunden' }`,
     * wenn ein Projekt an einer gebundenen Nachricht gesetzt werden sollte.
     */
    tmEinsortieren(id, { projektId, tags }, ts) {
      const bindung = stmt.tmBindung.get(id);
      if (!bindung) return null;
      if (projektId !== undefined && bindung.profil) return { fehler: 'gebunden' };
      if (projektId !== undefined) stmt.tmSetProjekt.run({ id, projektId: projektId || null });
      // Schlagworte laufen ueber den regulaeren Weg; er stempelt `aktualisiert`.
      // Ohne sie bleibt der Zeitstempel stehen: Einsortieren ist keine
      // Bearbeitung und soll die Nachricht nicht an die Spitze der Liste heben.
      if (tags !== undefined) return { entry: this.tmUpdate(id, { tags }, ts) };
      return { entry: tmEntry(stmt.tmGet.get(id)) };
    },

    /** Löschen. Gibt true, wenn eine Zeile entfernt wurde. */
    tmDelete(id) {
      return stmt.tmDel.run(id).changes > 0;
    },

    // ── Abnahme (BLK-AG) ────────────────────────────────────────────────

    /** Traegt die Testnachricht das Abnahme-Kennzeichen? (fehlend: false) */
    tmAbgenommen(id) {
      return stmt.tmAbn.get(id)?.abnahme_xml != null;
    },

    /**
     * Abnehmen: friert die aktuelle XML-Fassung mit Zeitstempel und optionalem
     * Kommentar ein; Neuabnahme ersetzt den Abnahme-Stand. Gibt entry oder null.
     */
    tmAbnahmeSetzen(id, { kommentar } = {}, ts) {
      const r = stmt.tmAbnSet.run({ id, ts: ts ?? Date.now(), kommentar: kommentar || null });
      if (!r.changes) return null;
      return tmEntry(stmt.tmGet.get(id));
    },

    /** Kennzeichen samt eingefrorener Fassung entfernen. Gibt entry oder null. */
    tmAbnahmeEntfernen(id) {
      const r = stmt.tmAbnClear.run(id);
      if (!r.changes) return null;
      return tmEntry(stmt.tmGet.get(id));
    },

    /** Eingefrorene Abnahme-Fassung (XML) oder null. */
    tmLoadAbnahmeXml(id) {
      return stmt.tmAbn.get(id)?.abnahme_xml ?? null;
    },

    /**
     * Einmalige Umstellung des Altbestands: jedes `hinweis`-Feld eines
     * Elementprofils wird ein Listeneintrag (Autor und Rolle leer, Zeitpunkt =
     * letzte Aenderung des Profils, Erledigt-Zustand uebernommen); danach sind
     * die Felder aus dem Dokument verschwunden.
     *
     * Mit umgestellt werden die eingefrorenen Dokumente (Versionen und die an
     * Testnachrichten gebundenen Kopien) samt ihrer Hashes — sonst meldete jede
     * abgenommene Profilierung nach der Umstellung "geaendert seit Abnahme"
     * und jede gebundene Testnachricht "Profil weiterentwickelt", ohne dass
     * sich fachlich etwas geaendert haette. Die Versionen selbst tragen keine
     * Hinweise (die haengen am Profil).
     *
     * Idempotent — ein zweiter Lauf findet nichts mehr. Kein Rueckwaertspfad.
     * Gibt die Anzahl angelegter Hinweise zurueck.
     */
    migriereHinweise() {
      let n = 0;
      db.transaction(() => {
        const setDoc = db.prepare(
          'UPDATE profiles SET doc = ?, doc_hash = ?, fach_hash = ? WHERE id = ?',
        );
        for (const r of db.prepare('SELECT id, doc, aktualisiert FROM profiles').all()) {
          const doc = JSON.parse(r.doc);
          const gefunden = hinweiseHerausloesen(doc);
          const neu = JSON.stringify(doc);
          if (neu === r.doc) continue;
          setDoc.run(neu, docHash(neu), fachHash(doc), r.id);
          for (const h of gefunden) {
            stmt.hwInsert.run({
              id: randomUUID(),
              profilId: r.id,
              pfad: h.pfad,
              text: h.text,
              autor: null,
              rolle: null,
              zeit: r.aktualisiert ?? Date.now(),
              erledigt: h.erledigt ? 1 : null,
              token: null,
            });
            n++;
          }
        }
        const setVer = db.prepare(
          'UPDATE profile_versions SET doc = ?, doc_hash = ?, fach_hash = ? WHERE id = ?',
        );
        for (const r of db.prepare('SELECT id, doc FROM profile_versions').all()) {
          const doc = JSON.parse(r.doc);
          hinweiseHerausloesen(doc);
          const neu = JSON.stringify(doc);
          if (neu !== r.doc) setVer.run(neu, docHash(neu), fachHash(doc), r.id);
        }
        const setVorgabe = db.prepare(
          'UPDATE testmessages SET vorgabe = ?, vorgabe_hash = ? WHERE id = ?',
        );
        for (const r of db
          .prepare('SELECT id, vorgabe FROM testmessages WHERE vorgabe IS NOT NULL')
          .all()) {
          const doc = JSON.parse(r.vorgabe);
          hinweiseHerausloesen(doc);
          const neu = JSON.stringify(doc);
          if (neu !== r.vorgabe) setVorgabe.run(neu, fachHash(doc), r.id);
        }
      })();
      return n;
    },

    /**
     * Trägt fehlende XJustiz-Versionen nach: leitet sie best-effort aus dem
     * gespeicherten XML ab (Attribut `xjustizVersion` an Wurzel oder
     * Nachrichtenkopf). Idempotent — wirkt nur auf Einträge ohne Version; läuft
     * beim Öffnen der DB. Gibt die Anzahl ergänzter Einträge zurück.
     */
    tmBackfillVersionen() {
      const offen = db
        .prepare(
          `SELECT id, xml FROM testmessages WHERE xjustiz_version IS NULL OR xjustiz_version = ''`,
        )
        .all();
      const set = db.prepare(`UPDATE testmessages SET xjustiz_version = ? WHERE id = ?`);
      let n = 0;
      db.transaction(() => {
        for (const r of offen) {
          const m = String(r.xml).match(/xjustizVersion\s*=\s*"([^"]+)"/);
          if (m) {
            set.run(m[1].trim(), r.id);
            n++;
          }
        }
      })();
      return n;
    },

    close() {
      db.close();
    },
  };

  // Alt-Bestand ohne erkannte XJustiz-Version einmalig aus dem XML nachziehen.
  api.tmBackfillVersionen();
  // Hinweise aus den Dokumenten in die eigene Ablage heben. Der Lauf ist fuer
  // sich idempotent; die Schema-Version spart nur den Voll-Scan bei jedem Start.
  if (db.pragma('user_version', { simple: true }) < SCHEMA_HINWEISE) {
    api.migriereHinweise();
    db.pragma(`user_version = ${SCHEMA_HINWEISE}`);
  }
  return api;
}
