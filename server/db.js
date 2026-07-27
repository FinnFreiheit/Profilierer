import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { toEntry } from './fortschritt.js';

/** Wie viele Automatik-Versionen (Oeffnen-Snapshot, Sicherheits-Version) je Profil bleiben. */
const AUTO_DECKEL = 10;

/**
 * Hash ueber den gespeicherten doc-String — Grundlage fuer "geaendert seit vX"
 * und die Entprellung der Automatik-Versionen. Bewusst ueber die Serialisierung
 * (nicht semantisch): anders serialisierte, gleiche Staende gelten als
 * "geaendert" — falsch-positiv ist hier harmlos.
 */
const docHash = (s) => createHash('sha1').update(s).digest('hex');

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
         (id, doc, doc_hash, name, nachricht, xjustiz_version, n_status, n_ausp, n_erw, gespeichert, aktualisiert)
       VALUES
         (@id, @doc, @docHash, @name, @nachricht, @xjustizVersion, @nStatus, @nAusp, @nErw, @gespeichert, @aktualisiert)
       ON CONFLICT(id) DO UPDATE SET
         doc = excluded.doc, doc_hash = excluded.doc_hash, name = excluded.name, nachricht = excluded.nachricht,
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

    // ── Testnachrichten (zentraler Testdaten-Speicher) ──────────────────
    tmList: db.prepare(
      `SELECT id, name, nachricht, fachmodul, xjustiz_version, groesse, notiz, hochgeladen, aktualisiert,
              entwurf, fortschritt, (entscheidungen IS NOT NULL) AS gefuehrt,
              abnahme_ts, abnahme_kommentar, (abnahme_xml IS NOT NULL) AS abgenommen,
              (abnahme_xml IS NOT NULL AND xml != abnahme_xml) AS geaendert_seit_abnahme
       FROM testmessages ORDER BY aktualisiert DESC`,
    ),
    tmGetXml: db.prepare('SELECT xml FROM testmessages WHERE id = ?'),
    tmGetEntscheidungen: db.prepare('SELECT entscheidungen FROM testmessages WHERE id = ?'),
    tmGet: db.prepare(
      `SELECT id, name, nachricht, fachmodul, xjustiz_version, groesse, notiz, hochgeladen, aktualisiert,
              entwurf, fortschritt, (entscheidungen IS NOT NULL) AS gefuehrt,
              abnahme_ts, abnahme_kommentar, (abnahme_xml IS NOT NULL) AS abgenommen,
              (abnahme_xml IS NOT NULL AND xml != abnahme_xml) AS geaendert_seit_abnahme
       FROM testmessages WHERE id = ?`,
    ),
    tmGetRow: db.prepare('SELECT * FROM testmessages WHERE id = ?'),
    tmInsert: db.prepare(
      `INSERT INTO testmessages
         (id, xml, name, nachricht, fachmodul, xjustiz_version, groesse, notiz, hochgeladen, aktualisiert,
          entwurf, fortschritt, entscheidungen)
       VALUES
         (@id, @xml, @name, @nachricht, @fachmodul, @xjustizVersion, @groesse, @notiz, @ts, @ts,
          @entwurf, @fortschritt, @entscheidungen)`,
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
    }
    const ts = aktualisiert ?? Date.now();
    const entry = toEntry(id, doc, ts);
    const docStr = JSON.stringify(doc);
    const hash = docHash(docStr);
    stmt.upsert.run({
      id,
      doc: docStr,
      docHash: hash,
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

    /** Kopie mit neuer id und Namenszusatz " (Kopie)". Gibt { id, entry } oder null. */
    duplicate(id) {
      const doc = this.load(id);
      if (!doc) return null;
      const copy = structuredClone(doc);
      copy.meta = { ...(copy.meta ?? {}), name: (copy.meta?.name || '(ohne Namen)') + ' (Kopie)' };
      return this.create(copy);
    },

    /** Nur den Namen aendern. Gibt den aktualisierten entry oder null. */
    rename(id, name) {
      const doc = this.load(id);
      if (!doc) return null;
      doc.meta = { ...(doc.meta ?? {}), name: (name || '').trim() };
      return upsert(id, doc);
    },

    /** Loeschen inkl. aller Versionen (Kaskade). Gibt true, wenn eine Zeile entfernt wurde. */
    delete(id) {
      return db.transaction(() => {
        stmt.verDelAll.run(id);
        return stmt.del.run(id).changes > 0;
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
          upsert(it.id, it.doc, it.aktualisiert);
          n++;
        }
        return n;
      });
      return tx(items ?? []);
    },

    // ── Testnachrichten ─────────────────────────────────────────────────

    /** Index-Liste (ohne xml), absteigend nach aktualisiert. */
    tmList() {
      return stmt.tmList.all().map(tmEntry);
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
        ts: stamp,
      });
      return { id, entry: tmEntry(stmt.tmGet.get(id)) };
    },

    /**
     * Felder ändern; nur die im Patch gesetzten werden übernommen (undefined =
     * unberührt). Aktualisiert-Zeitstempel setzen. Gibt entry oder null.
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
  return api;
}
