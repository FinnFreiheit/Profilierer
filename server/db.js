import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { toEntry } from './fortschritt.js';

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
function fachHash(doc) {
  let d = doc;
  if (d && typeof d === 'object' && d.meta && typeof d.meta === 'object') {
    const meta = { ...d.meta };
    delete meta.gespeichert;
    d = { ...d, meta };
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
const TM_COLS = `t.id, t.name, t.nachricht, t.fachmodul, t.xjustiz_version, t.groesse, t.notiz,
              t.hochgeladen, t.aktualisiert, t.entwurf, t.fortschritt,
              (t.entscheidungen IS NOT NULL) AS gefuehrt,
              t.abnahme_ts, t.abnahme_kommentar, (t.abnahme_xml IS NOT NULL) AS abgenommen,
              (t.abnahme_xml IS NOT NULL AND t.xml != t.abnahme_xml) AS geaendert_seit_abnahme,
              t.profil_id, t.profil_name, t.fassung,
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
    if (!cols.has('doc_hash')) db.exec('ALTER TABLE profiles ADD COLUMN doc_hash TEXT');
    if (!cols.has('fach_hash')) db.exec('ALTER TABLE profiles ADD COLUMN fach_hash TEXT');
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

  const stmt = {
    list: db.prepare(
      `SELECT profiles.id, profiles.name, nachricht, xjustiz_version, n_status, n_ausp, n_erw,
              gespeichert, aktualisiert, profiles.doc_hash,
              (SELECT COUNT(*) FROM profile_versions v WHERE v.profile_id = profiles.id) AS n_ver,
              (SELECT MAX(nr) FROM profile_versions v WHERE v.profile_id = profiles.id) AS letzte_nr,
              EXISTS(SELECT 1 FROM profile_versions v
                     WHERE v.profile_id = profiles.id AND v.doc_hash = profiles.doc_hash) AS bekannt,
              ab.nr AS abn_nr, ab.erstellt AS abn_zeit, ab.kommentar AS abn_kommentar,
              ab.doc_hash AS abn_hash
       FROM profiles LEFT JOIN profile_versions ab ON ab.id = profiles.abnahme_version_id
       ORDER BY aktualisiert DESC`,
    ),
    getDoc: db.prepare('SELECT doc FROM profiles WHERE id = ?'),
    getRow: db.prepare('SELECT doc, doc_hash, aktualisiert FROM profiles WHERE id = ?'),
    exists: db.prepare('SELECT 1 FROM profiles WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM profiles'),
    del: db.prepare('DELETE FROM profiles WHERE id = ?'),
    upsert: db.prepare(
      `INSERT INTO profiles
         (id, doc, doc_hash, fach_hash, name, nachricht, xjustiz_version, n_status, n_ausp, n_erw, gespeichert, aktualisiert)
       VALUES
         (@id, @doc, @docHash, @fachHash, @name, @nachricht, @xjustizVersion, @nStatus, @nAusp, @nErw, @gespeichert, @aktualisiert)
       ON CONFLICT(id) DO UPDATE SET
         doc = excluded.doc, doc_hash = excluded.doc_hash, fach_hash = excluded.fach_hash,
         name = excluded.name, nachricht = excluded.nachricht,
         xjustiz_version = excluded.xjustiz_version, n_status = excluded.n_status,
         n_ausp = excluded.n_ausp, n_erw = excluded.n_erw, gespeichert = excluded.gespeichert,
         aktualisiert = excluded.aktualisiert`,
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
      `INSERT INTO profile_versions (id, profile_id, nr, kommentar, automatisch, abnahme, doc, doc_hash, erstellt)
       VALUES (@id, @profileId, @nr, @kommentar, @automatisch, @abnahme, @doc, @docHash, @erstellt)`,
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
      `SELECT v.nr, v.kommentar, v.erstellt, v.doc_hash
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
      `INSERT INTO hinweise (id, profil_id, pfad, text, autor, rolle, zeit, erledigt)
       VALUES (@id, @profilId, @pfad, @text, @autor, @rolle, @zeit, @erledigt)`,
    ),
    hwUpdate: db.prepare(
      'UPDATE hinweise SET text = @text, erledigt = @erledigt WHERE id = @id AND profil_id = @profilId',
    ),
    hwDel: db.prepare('DELETE FROM hinweise WHERE id = ? AND profil_id = ?'),
    hwDelAll: db.prepare('DELETE FROM hinweise WHERE profil_id = ?'),
    hwCount: db.prepare('SELECT COUNT(*) AS n FROM hinweise WHERE profil_id = ?'),

    // ── Testnachrichten (zentraler Testdaten-Speicher) ──────────────────
    tmList: db.prepare(`SELECT ${TM_COLS} ${TM_FROM} ORDER BY t.aktualisiert DESC`),
    tmListProfil: db.prepare(
      `SELECT ${TM_COLS} ${TM_FROM} WHERE t.profil_id = ? ORDER BY t.aktualisiert DESC`,
    ),
    tmGetXml: db.prepare('SELECT xml FROM testmessages WHERE id = ?'),
    tmGetEntscheidungen: db.prepare('SELECT entscheidungen FROM testmessages WHERE id = ?'),
    tmGetVorgabe: db.prepare('SELECT vorgabe FROM testmessages WHERE id = ?'),
    tmGet: db.prepare(`SELECT ${TM_COLS} ${TM_FROM} WHERE t.id = ?`),
    tmGetRow: db.prepare('SELECT * FROM testmessages WHERE id = ?'),
    tmInsert: db.prepare(
      `INSERT INTO testmessages
         (id, xml, name, nachricht, fachmodul, xjustiz_version, groesse, notiz, hochgeladen, aktualisiert,
          entwurf, fortschritt, entscheidungen, profil_id, profil_name, fassung, vorgabe, vorgabe_hash)
       VALUES
         (@id, @xml, @name, @nachricht, @fachmodul, @xjustizVersion, @groesse, @notiz, @ts, @ts,
          @entwurf, @fortschritt, @entscheidungen, @profilId, @profilName, @fassung, @vorgabe, @vorgabeHash)`,
    ),
    tmUpdate: db.prepare(
      `UPDATE testmessages SET
         xml = @xml, notiz = @notiz, name = @name, groesse = @groesse,
         entwurf = @entwurf, fortschritt = @fortschritt, entscheidungen = @entscheidungen,
         aktualisiert = @aktualisiert
       WHERE id = @id`,
    ),
    tmDel: db.prepare('DELETE FROM testmessages WHERE id = ?'),
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
  function versionsInfo(profileId, aktuellerHash) {
    const r = stmt.verInfo.get({ pid: profileId, hash: aktuellerHash });
    if (!r || !r.n) return {};
    return {
      nVersionen: r.n,
      letzteVersionNr: r.maxNr,
      geaendert: r.bekannt ? undefined : true,
      ...abnahmeInfo(profileId, aktuellerHash),
    };
  }

  /**
   * Abnahme-Felder des LibraryEntry — abgeleitet aus der referenzierten
   * Abnahme-Version; "geaendert seit Abnahme" per Hash-Vergleich zwischen
   * Arbeitsstand und eingefrorenem Stand.
   */
  function abnahmeInfo(profileId, aktuellerHash) {
    const a = stmt.abnGet.get(profileId);
    if (!a) return {};
    return {
      abgenommen: true,
      abnahmeVersionNr: a.nr,
      abnahmeZeit: a.erstellt,
      abnahmeKommentar: a.kommentar ?? undefined,
      geaendertSeitAbnahme: a.doc_hash === aktuellerHash ? undefined : true,
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
    stmt.upsert.run({
      id,
      doc: docStr,
      docHash: hash,
      fachHash: fachHash(doc),
      name: entry.name,
      nachricht: entry.nachricht,
      xjustizVersion: entry.xjustizVersion ?? null,
      nStatus: entry.nStatus,
      nAusp: entry.nAusp,
      nErw: entry.nErw,
      gespeichert: entry.gespeichert ?? null,
      aktualisiert: ts,
    });
    return { ...entry, ...versionsInfo(id, hash) };
  }

  const api = {
    _db: db,

    /** Bibliotheks-Index (LibraryEntry[]), absteigend nach aktualisiert. */
    list() {
      return stmt.list.all().map((r) => ({
        id: r.id,
        name: r.name,
        nachricht: r.nachricht,
        xjustizVersion: r.xjustiz_version ?? undefined,
        nStatus: r.n_status,
        nAusp: r.n_ausp,
        nErw: r.n_erw ?? undefined,
        gespeichert: r.gespeichert ?? undefined,
        aktualisiert: r.aktualisiert,
        nVersionen: r.n_ver || undefined,
        letzteVersionNr: r.letzte_nr ?? undefined,
        geaendert: r.n_ver > 0 && !r.bekannt ? true : undefined,
        abgenommen: r.abn_nr != null ? true : undefined,
        abnahmeVersionNr: r.abn_nr ?? undefined,
        abnahmeZeit: r.abn_zeit ?? undefined,
        abnahmeKommentar: r.abn_kommentar ?? undefined,
        geaendertSeitAbnahme: r.abn_nr != null && r.abn_hash !== r.doc_hash ? true : undefined,
      }));
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
          });
        return out;
      })();
    },

    /** Nur den Namen aendern. Gibt den aktualisierten entry oder null. */
    rename(id, name) {
      const doc = this.load(id);
      if (!doc) return null;
      doc.meta = { ...(doc.meta ?? {}), name: (name || '').trim() };
      return upsert(id, doc);
    },

    /**
     * Loeschen inkl. aller Versionen und Hinweise (Kaskade). Gibt true, wenn
     * eine Zeile entfernt wurde.
     */
    delete(id) {
      return db.transaction(() => {
        stmt.verDelAll.run(id);
        stmt.hwDelAll.run(id);
        return stmt.del.run(id).changes > 0;
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
      stmt.hwInsert.run({
        id,
        profilId,
        pfad: String(pfad ?? ''),
        text: String(text ?? '').trim(),
        autor: name || null,
        rolle: rolle === 'ag' || rolle === 'extern' ? rolle : null,
        zeit: ts ?? Date.now(),
        erledigt: null,
      });
      return hinweisZeile(stmt.hwGet.get(id, profilId));
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
     * '@' entsprechen `unterPfad` im Client — ohne sie traefe `…/anlage` auch
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
          ...versionsInfo(profileId, row.doc_hash),
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
            ...versionsInfo(profileId, row.doc_hash),
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
        ...versionsInfo(profileId, row.doc_hash),
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
        entwurf: entwurf ? 1 : null,
        fortschritt: fortschritt ? JSON.stringify(fortschritt) : null,
        entscheidungen: entscheidungen ? JSON.stringify(entscheidungen) : null,
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
     * Felder ändern; nur die im Patch gesetzten werden übernommen (undefined =
     * unberührt). Aktualisiert-Zeitstempel setzen. Gibt entry oder null.
     * Herkunft und eingefrorene Kopie der Profil-Bindung sind bewusst nicht
     * änderbar — die gebundene Fassung ist unveränderliche Vorgabe.
     */
    tmUpdate(id, { notiz, name, xml, entwurf, fortschritt, entscheidungen }, ts) {
      const row = stmt.tmGetRow.get(id);
      if (!row) return null;
      const nextXml = xml !== undefined ? String(xml) : row.xml;
      const next = {
        xml: nextXml,
        groesse: xml !== undefined ? nextXml.length : row.groesse,
        notiz: notiz !== undefined ? notiz || null : row.notiz,
        name: name !== undefined ? name || null : row.name,
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
        aktualisiert: ts ?? Date.now(),
      };
      stmt.tmUpdate.run({ id, ...next });
      return tmEntry(stmt.tmGet.get(id));
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
            });
            n++;
          }
        }
        const setVer = db.prepare('UPDATE profile_versions SET doc = ?, doc_hash = ? WHERE id = ?');
        for (const r of db.prepare('SELECT id, doc FROM profile_versions').all()) {
          const doc = JSON.parse(r.doc);
          hinweiseHerausloesen(doc);
          const neu = JSON.stringify(doc);
          if (neu !== r.doc) setVer.run(neu, docHash(neu), r.id);
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
